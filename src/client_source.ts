import { dirname, join } from 'node:path';
import type { AppConfig } from './config.ts';
import type { OAuthClient } from './oauth.ts';
import { EMBEDDED_CLIENT_ID, EMBEDDED_CLIENT_SECRET } from './client_credentials.ts';

/** De dónde salen las credenciales del cliente (app), nunca de un usuario. */
export type ClientSourceKind = 'config' | 'embedded' | 'file' | 'none';

/** Credenciales del cliente OAuth resueltas + su procedencia. */
export interface ResolvedClient extends OAuthClient {
	source: ClientSourceKind;
}

/** Credenciales parciales (una fuente puede estar incompleta o ausente). */
export interface ClientCandidates {
	/** Guardadas por `office2google setup` — prioridad máxima (decisión explícita). */
	fromConfig?: Partial<OAuthClient>;
	/** Embebidas en el binario. */
	fromEmbedded?: Partial<OAuthClient>;
	/** `client_secret.json` descubierto junto al exe. */
	fromFile?: Partial<OAuthClient>;
}

/** Etiqueta legible de cada origen (para `status`). */
export const CLIENT_SOURCE_LABEL: Record<ClientSourceKind, string> = {
	config: 'configurado ✓ (setup)',
	embedded: 'embebido ✓ (en el exe)',
	file: 'junto al exe ✓ (client_secret.json)',
	none: 'no encontrado',
};

const complete = (c?: Partial<OAuthClient>): c is OAuthClient =>
	!!c?.clientId && !!c.clientSecret;

/**
 * Resuelve las credenciales del cliente por orden de prioridad:
 * setup (explícito) > embebidas > JSON junto al exe.
 * Devuelve `null` si ninguna fuente está completa.
 */
export function resolveClient(candidates: ClientCandidates): ResolvedClient | null {
	if (complete(candidates.fromConfig)) return { ...candidates.fromConfig, source: 'config' };
	if (complete(candidates.fromEmbedded)) return { ...candidates.fromEmbedded, source: 'embedded' };
	if (complete(candidates.fromFile)) return { ...candidates.fromFile, source: 'file' };
	return null;
}

/** Extrae client_id/client_secret del JSON de Google Cloud (`installed` o `web`). */
export function parseClientJson(text: string): OAuthClient | null {
	try {
		const data: unknown = JSON.parse(text);
		if (typeof data !== 'object' || data === null) return null;
		const rec = data as Record<string, unknown>;
		const inst = (rec.installed ?? rec.web) as Record<string, unknown> | undefined;
		if (typeof inst?.client_id !== 'string' || typeof inst.client_secret !== 'string') return null;
		if (!inst.client_id || !inst.client_secret) return null;
		return { clientId: inst.client_id, clientSecret: inst.client_secret };
	} catch {
		return null;
	}
}

/** Nombre del JSON que se autodescubre. */
export const CLIENT_FILE_NAME = 'client_secret.json';

/**
 * Directorios donde buscar `client_secret.json`:
 * junto al exe instalado (caso distribuido) y el cwd (caso `bun run dev`).
 */
export function candidateClientDirs(
	deps: { execPath?: string; cwd?: string } = {},
): string[] {
	const execPath = deps.execPath ?? process.execPath;
	const cwd = deps.cwd ?? process.cwd();
	const dirs = [dirname(execPath), cwd];
	// dedupe preservando orden (en dev, execPath apunta a bun y cwd al repo)
	return dirs.filter((d, i) => dirs.indexOf(d) === i);
}

/** Lee el primer `client_secret.json` válido de la lista de directorios. */
export async function readClientFile(dirs: string[]): Promise<Partial<OAuthClient> | undefined> {
	for (const dir of dirs) {
		try {
			const file = Bun.file(join(dir, CLIENT_FILE_NAME));
			if (!(await file.exists())) continue;
			const creds = parseClientJson(await file.text());
			if (creds) return creds;
		} catch {
			// archivo ilegible/JSON inválido → sigue con el siguiente candidato
		}
	}
	return undefined;
}

/**
 * Combina config + embebidas + JSON junto al exe en una única resolución.
 * `dirs` y `embedded` son inyectables para testear sin tocar el binario real.
 */
export async function loadClient(
	cfg: AppConfig,
	opts: { dirs?: string[]; embedded?: Partial<OAuthClient> } = {},
): Promise<ResolvedClient | null> {
	const fromFile = await readClientFile(opts.dirs ?? candidateClientDirs());
	const embedded = opts.embedded ?? { clientId: EMBEDDED_CLIENT_ID, clientSecret: EMBEDDED_CLIENT_SECRET };
	return resolveClient({ fromConfig: cfg, fromEmbedded: embedded, fromFile });
}
