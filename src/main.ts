import { stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { err, ok, isErr, type Result, type AppError } from './result.ts';
import { extInfo, editorUrl, type ExtInfo } from './editors.ts';
import {
	defaultConfigPath,
	loadConfig,
	saveConfig,
	tokensExpired,
	type AppConfig,
	type TokenSet,
} from './config.ts';
import { interactiveAuth, refreshAccessToken, type OAuthClient } from './oauth.ts';
import { CLIENT_SOURCE_LABEL, loadClient, parseClientJson } from './client_source.ts';
import { ensureFolder, findFilesByName, uploadFile } from './drive.ts';
import { openUrl } from './browser.ts';
import { writeLog } from './logger.ts';

export type Command =
	| { kind: 'usage' }
	| { kind: 'setup'; clientJson: string }
	| { kind: 'auth' }
	| { kind: 'status' }
	| { kind: 'open'; files: string[] };

/** Parsea argv de la CLI. */
export function parseArgs(argv: string[]): Command {
	const [first, second] = argv;
	if (!first) return { kind: 'usage' };
	if (first === 'setup') return second ? { kind: 'setup', clientJson: second } : { kind: 'usage' };
	if (first === 'auth') return { kind: 'auth' };
	if (first === 'status') return { kind: 'status' };
	return { kind: 'open', files: argv };
}

/** Guarda client_id/client_secret desde el JSON descargado de Google Cloud. */
export async function cmdSetup(cfgPath: string, jsonPath: string): Promise<Result<null>> {
	try {
		const file = Bun.file(jsonPath);
		if (!(await file.exists())) return err('SETUP_FAILED', 'No existe el archivo JSON', jsonPath);
		const creds = parseClientJson(await file.text());
		if (!creds) {
			return err('SETUP_FAILED', 'El JSON no contiene client_id/client_secret válidos', jsonPath);
		}
		const [loadErr, cfg] = await loadConfig(cfgPath);
		if (loadErr) return [loadErr, null];
		const merged: AppConfig = { ...cfg, clientId: creds.clientId, clientSecret: creds.clientSecret };
		const [saveErr] = await saveConfig(cfgPath, merged);
		if (saveErr) return [saveErr, null];
		return ok(null);
	} catch (e) {
		return err('SETUP_FAILED', 'No se pudo leer el JSON de Google', String(e));
	}
}

/** Credenciales del cliente: setup > embebidas > JSON junto al exe. */
const NO_CLIENT_HELP =
	'Opciones: 1) coloca client_secret.json junto a office2google.exe, o 2) ejecuta: office2google setup <client_secret.json>';

/** Tipo de abridor de URL (inyectable para tests). */
type Opener = (url: string) => Promise<Result<null>>;

/** Asegura tokens válidos (login interactivo o refresh). */
async function ensureTokens(
	cfgPath: string,
	cfg: AppConfig,
	fetchFn = fetch,
	opener?: Opener,
): Promise<Result<TokenSet>> {
	const resolved = await loadClient(cfg);
	if (!resolved) return err('NO_CLIENT', 'Falta el cliente de Google', NO_CLIENT_HELP);
	const client: OAuthClient = { clientId: resolved.clientId, clientSecret: resolved.clientSecret };

	if (cfg.tokens && !tokensExpired(cfg.tokens)) return ok(cfg.tokens);

	if (cfg.tokens?.refreshToken) {
		const [refreshErr, refreshed] = await refreshAccessToken(client, cfg.tokens.refreshToken, fetchFn);
		if (!refreshErr && refreshed) {
			const next = { ...cfg, tokens: refreshed };
			await saveConfig(cfgPath, next);
			return ok(refreshed);
		}
		// si el refresh falló, cae a login interactivo
	}

	console.log('Se abrirá Google en tu navegador para autorizar...');
	const [authErr, tokens] = await interactiveAuth(client, { fetchFn, opener });
	if (authErr) return [authErr, null];
	await saveConfig(cfgPath, { ...cfg, tokens });
	return ok(tokens);
}

/** Borra la sesión guardada y fuerza un login interactivo nuevo. */
async function reauthorize(
	cfgPath: string,
	cfg: AppConfig,
	fetchFn = fetch,
	opener?: Opener,
): Promise<Result<TokenSet>> {
	const cleared: AppConfig = { ...cfg, tokens: undefined };
	await saveConfig(cfgPath, cleared);
	return ensureTokens(cfgPath, cleared, fetchFn, opener);
}

/**
 * Abre el archivo y, si Google responde que la sesión ya no vale (401),
 * reautoriza y reintenta una sola vez.
 */
export async function openWithReauth(
	open: (token: string) => Promise<Result<string>>,
	reauth: () => Promise<Result<TokenSet>>,
	initialToken: string,
): Promise<Result<string>> {
	const [err, url] = await open(initialToken);
	if (!err) return [null, url];
	if (err.code !== 'AUTH_EXPIRED') return [err, null];

	console.log('La sesión de Google caducó o se revocó. Vuelve a autorizar...');
	const [reErr, tokens] = await reauth();
	if (reErr) return [reErr, null];
	const [err2, url2] = await open(tokens.accessToken);
	return err2 ? [err2, null] : [null, url2];
}

/** Abre un archivo: dedupe en Drive -> subir si no existe -> abrir editor. */
async function openOne(
	filePath: string,
	cfgPath: string,
	cfg: AppConfig,
	token: string,
	fetchFn = fetch,
): Promise<Result<string>> {
	const info: ExtInfo | null = extInfo(basename(filePath));
	if (!info) return err('UNSUPPORTED_EXT', `Extensión no soportada: ${basename(filePath)}`);

	try {
		const st = await stat(filePath);
		if (!st.isFile()) return err('FILE_NOT_FOUND', 'No es un archivo', filePath);
	} catch {
		return err('FILE_NOT_FOUND', 'El archivo no existe', filePath);
	}

	const [folderErr, folderId] = await ensureFolder(token, cfg.folderId, fetchFn);
	if (folderErr) return [folderErr, null];
	if (folderId !== cfg.folderId) await saveConfig(cfgPath, { ...cfg, folderId });

	const name = basename(filePath);
	const [findErr, found] = await findFilesByName(token, folderId, name, fetchFn);
	if (findErr) return [findErr, null];

	const existing = found.find((f) => f.mimeType !== undefined && f.mimeType !== FOLDER_MIME_SENTINEL);
	let fileId = existing?.id;

	if (!fileId) {
		const [upErr, uploaded] = await uploadFile(
			token,
			{ filePath, name, mimeType: info.mime, folderId },
			fetchFn,
		);
		if (upErr) return [upErr, null];
		fileId = uploaded.id;
	}

	return ok(editorUrl(info.kind, fileId));
}

const FOLDER_MIME_SENTINEL = 'application/vnd.google-apps.folder';

/** Orquesta la apertura de N archivos. */
export async function runOpen(
	files: string[],
	fetchFn = fetch,
	opener?: Opener,
): Promise<AppError[]> {
	const cfgPath = defaultConfigPath();
	const [loadErr, cfg] = await loadConfig(cfgPath);
	if (loadErr) return [loadErr];

	const tokenResult = await ensureTokens(cfgPath, cfg, fetchFn, opener);
	if (isErr(tokenResult)) return [tokenResult[0]];
	let currentToken = tokenResult[1].accessToken;

	const failures: AppError[] = [];
	let currentCfg = cfg;
	for (const file of files) {
		await writeLog(defaultConfigDir(), `START ${file}`);
		const [openErr, url] = await openWithReauth(
			(token) => openOne(file, cfgPath, currentCfg, token, fetchFn),
			async (): Promise<Result<TokenSet>> => {
				const [reErr, newTokens] = await reauthorize(cfgPath, currentCfg, fetchFn, opener);
				if (!reErr && newTokens) currentToken = newTokens.accessToken;
				return reErr ? [reErr, null] : [null, newTokens];
			},
			currentToken,
		);
		if (openErr) {
			failures.push(openErr);
			console.error(`  ✗ ${openErr.message}${openErr.detail ? ` (${openErr.detail})` : ''}`);
			await writeLog(defaultConfigDir(), `ERROR ${openErr.code}: ${openErr.message} | ${file}`);
			continue;
		}
		// recarga el config por si openOne actualizó folderId
		const [r, fresh] = await loadConfig(cfgPath);
		currentCfg = r ? currentCfg : fresh;
		const [bErr] = await openUrl(url);
		if (bErr) {
			failures.push(bErr);
			console.error(`  ✗ ${bErr.message}: ${url}`);
			continue;
		}
		console.log(`  ✓ ${basename(file)} → ${url}`);
		await writeLog(defaultConfigDir(), `OK ${file} -> ${url}`);
	}
	return failures;
}

function defaultConfigDir(): string {
	return dirname(defaultConfigPath());
}

async function cmdStatus(): Promise<void> {
	const cfgPath = defaultConfigPath();
	const [loadErr, cfg] = await loadConfig(cfgPath);
	console.log(`Config: ${cfgPath}`);
	if (loadErr) {
		console.log(`  ✗ ${loadErr.message}`);
		return;
	}
	const client = await loadClient(cfg);
	console.log(
		client
			? `  Cliente OAuth: ${CLIENT_SOURCE_LABEL[client.source]}`
			: `  Cliente OAuth: FALTA (${NO_CLIENT_HELP})`,
	);
	console.log(
		`  Sesión Google: ${
			cfg.tokens && !tokensExpired(cfg.tokens) ? 'activa ✓' : cfg.tokens?.refreshToken ? 'expirada (se renueva solo)' : 'FALTA (el primer doble click la hará)'
		}`,
	);
	console.log(`  Carpeta Drive: ${cfg.folderId ?? 'se creará automáticamente'}`);
}

const USAGE = `office2google — doble click en Office abre Google Docs/Sheets/Slides

Uso:
  office2google <archivo.docx|xls|pptx...>   Abre el archivo en el navegador
  office2google setup <client_secret.json>   Usa credenciales propias (opcional)
  office2google auth                         Fuerza login con Google
  office2google status                       Muestra el estado de la configuración

Instalación en otro PC:
  install.bat    Copia el exe a tu usuario y asocia las extensiones Office`;

/** Pausa solo si hay terminal interactiva (para doble click en .exe). */
async function pauseIfInteractive(): Promise<void> {
	if (!process.stdin.isTTY) return;
	console.log('\nPresiona Enter para cerrar...');
	await new Promise<void>((resolve) => {
		const onData = (d: Buffer) => {
			if (d.includes('\r') || d.includes('\n')) {
				process.stdin.off('data', onData);
				resolve();
			}
		};
		process.stdin.on('data', onData);
	});
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	if (argv.length > 0) await writeLog(defaultConfigDir(), `ARGS ${JSON.stringify(argv)}`);
	const cmd = parseArgs(argv);
	let failures: AppError[] = [];

	switch (cmd.kind) {
		case 'usage':
			console.log(USAGE);
			break;
		case 'setup': {
			const [setupErr] = await cmdSetup(defaultConfigPath(), cmd.clientJson);
			if (setupErr) failures = [setupErr];
			else console.log('✓ Credenciales guardadas. Siguiente: office2google auth');
			break;
		}
		case 'auth': {
			const cfgPath = defaultConfigPath();
			const [loadErr, cfg] = await loadConfig(cfgPath);
			if (loadErr) failures = [loadErr];
			else {
				const [tokErr] = await ensureTokens(cfgPath, { ...cfg, tokens: undefined });
				if (tokErr) failures = [tokErr];
				else console.log('✓ Sesión de Google guardada. Ya puedes usar el doble click.');
			}
			break;
		}
		case 'status':
			await cmdStatus();
			break;
		case 'open':
			failures = await runOpen(cmd.files);
			break;
	}

	if (failures.length > 0) {
		const first = failures[0];
		if (first) console.error(`\n✗ ${first.message}${first.detail ? `\n  ${first.detail}` : ''}`);
		if (first?.code === 'NO_CLIENT') console.error(`\nGuía completa: README.md (${NO_CLIENT_HELP})`);
		await pauseIfInteractive();
		process.exitCode = 1;
	}
}

if (import.meta.main) {
	await main();
}
