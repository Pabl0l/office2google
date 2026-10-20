import { describe, it, expect, afterEach } from 'bun:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { randomString } from '../src/oauth.ts';
import { defaultConfigPath, loadConfig, saveConfig, tokensExpired, type AppConfig, type TokenSet } from '../src/config.ts';
import { forcedBrowser, openUrl } from '../src/browser.ts';
import { parseArgs, cmdSetup, openWithReauth } from '../src/main.ts';
import { err, ok, type Result } from '../src/result.ts';

const tmpFile = () => join(tmpdir(), 'o2g-test', `${randomString(8)}.json`);
const cleanup: string[] = [];
afterEach(() => cleanup.length = 0);

describe('config', () => {
	it('debería usar %APPDATA% para la ruta por defecto', () => {
		expect(defaultConfigPath({ APPDATA: 'C:\\Users\\x\\AppData\\Roaming' })).toBe(
			join('C:\\Users\\x\\AppData\\Roaming', 'office2google', 'config.json'),
		);
	});

	it('debería devolver config vacía si el archivo no existe', async () => {
		const [error, cfg] = await loadConfig(tmpFile());
		expect(error).toBeNull();
		expect(cfg).toEqual({});
	});

	it('debería hacer roundtrip guardar/cargar', async () => {
		const path = tmpFile();
		cleanup.push(path);
		const data: AppConfig = {
			clientId: 'c1',
			folderId: 'f1',
			tokens: { accessToken: 'at', refreshToken: 'rt', expiresAt: 123 },
		};
		expect((await saveConfig(path, data))[0]).toBeNull();
		const [error, loaded] = await loadConfig(path);
		expect(error).toBeNull();
		expect(loaded).toEqual(data);
	});

	it('debería devolver CONFIG_ERROR si el JSON está corrupto', async () => {
		const path = tmpFile();
		await Bun.write(path, '{no-es-json');
		const [error] = await loadConfig(path);
		expect(error?.code).toBe('CONFIG_ERROR');
	});
});

describe('tokensExpired', () => {
	it('debería considerar expirados los ausentes o por vencer', () => {
		expect(tokensExpired(undefined)).toBe(true);
		expect(tokensExpired({ accessToken: 'a', expiresAt: Date.now() + 30_000 })).toBe(true); // <60s margen
		expect(tokensExpired({ accessToken: 'a', expiresAt: Date.now() + 600_000 })).toBe(false);
	});
});

describe('browser.openUrl', () => {
	it('debería abrir URLs válidas de Google vía rundll32', async () => {
		let args: string[] = [];
		const [error] = await openUrl('https://docs.google.com/document/d/abc_123/edit', async (a) => {
			args = a;
		});
		expect(error).toBeNull();
		expect(args).toEqual(['rundll32.exe', 'url.dll,FileProtocolHandler', 'https://docs.google.com/document/d/abc_123/edit']);
	});

	it('debería abrir la URL de consentimiento OAuth de Google', async () => {
		const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A9%2Fcb&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file&code_challenge=X&code_challenge_method=S256';
		let args: string[] = [];
		const [error] = await openUrl(authUrl, async (a) => {
			args = a;
		});
		expect(error).toBeNull();
		expect(args[0]).toBe('rundll32.exe');
		expect(args[2]).toBe(authUrl);
	});

	it('debería rechazar URLs que no sean editors ni consentimiento de Google', async () => {
		for (const bad of [
			'https://evil.com/x',
			'file:///C:/Windows',
			'https://docs.google.com/document/d/a/edit?x=1',
			'javascript:alert(1)',
			'https://accounts.google.com/o/oauth2/v2/auth?x=1"; calc.exe',
			'https://accounts.google.com/o/oauth2/v2/auth?x=1 con espacio',
		]) {
			const [error] = await openUrl(bad, async () => {});
			expect(error?.code).toBe('BROWSER_ERROR');
		}
	});

	it('debería caer a PowerShell si rundll32 falla', async () => {
		const calls: string[][] = [];
		const url = 'https://docs.google.com/spreadsheets/d/abc123/edit';
		const [error] = await openUrl(url, async (a) => {
			calls.push(a);
			if (a[0] !== 'powershell.exe') throw new Error('rundll32 roto');
		});
		expect(error).toBeNull();
		expect(calls).toHaveLength(2);
		expect(calls[0]?.[0]).toBe('rundll32.exe');
		expect(calls[1]?.[0]).toBe('powershell.exe');
		expect(calls[1]?.join(' ')).toContain("Start-Process '" + url + "'");
	});

	it('debería mapear errores de ambos métodos a BROWSER_ERROR', async () => {
		let calls = 0;
		const [error] = await openUrl('https://docs.google.com/presentation/d/abc/edit', async () => {
			calls++;
			throw new Error('fallo');
		});
		expect(error?.code).toBe('BROWSER_ERROR');
		expect(error?.detail).toContain('fallo');
		expect(calls).toBe(2);
	});
});

describe('browser.forcedBrowser', () => {
	it('debería devolver undefined si no se pide navegador', () => {
		expect(forcedBrowser({})).toBeUndefined();
		expect(forcedBrowser({ O2G_BROWSER: '  ' })).toBeUndefined();
	});

	it('debería resolver el navegador pedido si está instalado', () => {
		expect(forcedBrowser({ O2G_BROWSER: 'chrome' }, () => true)).toBe(
			'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		);
		expect(forcedBrowser({ O2G_BROWSER: 'CHROME' }, () => true)).toContain('chrome.exe');
		expect(forcedBrowser({ O2G_BROWSER: 'edge' }, () => true)).toContain('msedge.exe');
	});

	it('debería devolver undefined si el navegador no existe o no es válido', () => {
		expect(forcedBrowser({ O2G_BROWSER: 'chrome' }, () => false)).toBeUndefined();
		expect(forcedBrowser({ O2G_BROWSER: 'netscape' }, () => true)).toBeUndefined();
	});

	it('openUrl debería usar el navegador forzado y caer a rundll32 si no aplica', async () => {
		const url = 'https://docs.google.com/document/d/abc_123/edit';
		const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
		let args: string[] = [];
		const [error] = await openUrl(url, async (a) => { args = a; }, { O2G_BROWSER: 'chrome' });
		expect(error).toBeNull();
		if (existsSync(chromePath)) {
			expect(args[0]).toBe(chromePath);
			expect(args[1]).toBe('--new-window');
			expect(args[2]).toBe(url);
		} else {
			expect(args[0]).toBe('rundll32.exe');
		}

		let fallback: string[] = [];
		await openUrl(url, async (a) => { fallback = a; }, { O2G_BROWSER: 'inexistente' });
		expect(fallback[0]).toBe('rundll32.exe');
	});
});

describe('main.parseArgs', () => {
	it('sin argumentos → usage', () => {
		expect(parseArgs([]).kind).toBe('usage');
	});
	it('setup con json', () => {
		expect(parseArgs(['setup', 'C:\\x.json'])).toEqual({ kind: 'setup', clientJson: 'C:\\x.json' });
	});
	it('setup sin json → usage', () => {
		expect(parseArgs(['setup']).kind).toBe('usage');
	});
	it('auth y status', () => {
		expect(parseArgs(['auth']).kind).toBe('auth');
		expect(parseArgs(['status']).kind).toBe('status');
	});
	it('rutas de archivo → open con todos los args', () => {
		expect(parseArgs(['C:\\docs\\a.docx'])).toEqual({ kind: 'open', files: ['C:\\docs\\a.docx'] });
	});
});

describe('main.openWithReauth', () => {
	const nuevaSesion = (): Result<TokenSet> =>
		ok<TokenSet>({ accessToken: 'tok-nuevo', expiresAt: Date.now() + 3_600_000 });

	it('debería reautorizar y reintentar una vez si la sesión caducó', async () => {
		const usados: string[] = [];
		let intentos = 0;
		const open = async (token: string): Promise<Result<string>> => {
			usados.push(token);
			intentos++;
			if (intentos === 1) return err('AUTH_EXPIRED', 'La sesión ya no es válida');
			return ok('https://docs.google.com/document/d/x/edit');
		};
		let reauths = 0;
		const reauth = async (): Promise<Result<TokenSet>> => {
			reauths++;
			return nuevaSesion();
		};

		const [error, url] = await openWithReauth(open, reauth, 'tok-viejo');
		expect(error).toBeNull();
		expect(url).toContain('docs.google.com');
		expect(reauths).toBe(1);
		expect(usados).toEqual(['tok-viejo', 'tok-nuevo']);
	});

	it('no debería reautorizar si el error no es de sesión', async () => {
		let reauths = 0;
		const open = async (): Promise<Result<string>> => err('FILE_NOT_FOUND', 'No existe');
		const reauth = async (): Promise<Result<TokenSet>> => {
			reauths++;
			return nuevaSesion();
		};
		const [error] = await openWithReauth(open, reauth, 'tok');
		expect(error?.code).toBe('FILE_NOT_FOUND');
		expect(reauths).toBe(0);
	});

	it('debería propagar el fallo si la reautorización falla', async () => {
		const open = async (): Promise<Result<string>> => err('AUTH_EXPIRED', 'La sesión ya no es válida');
		const reauth = async (): Promise<Result<TokenSet>> => err('AUTH_FAILED', 'El usuario canceló');
		const [error] = await openWithReauth(open, reauth, 'tok');
		expect(error?.code).toBe('AUTH_FAILED');
	});
});

describe('main.cmdSetup', () => {
	it('debería extraer client_id/secret del JSON de Google (formato installed)', async () => {
		const jsonPath = join(tmpdir(), `o2g-client-${randomString(6)}.json`);
		await Bun.write(
			jsonPath,
			JSON.stringify({ installed: { client_id: 'id-1', client_secret: 'sec-1', auth_uri: 'x' } }),
		);
		const cfgPath = tmpFile();
		const [error] = await cmdSetup(cfgPath, jsonPath);
		expect(error).toBeNull();
		const [, cfg] = await loadConfig(cfgPath);
		expect(cfg?.clientId).toBe('id-1');
		expect(cfg?.clientSecret).toBe('sec-1');
	});

	it('debería fallar con un JSON sin credenciales', async () => {
		const jsonPath = join(tmpdir(), `o2g-bad-${randomString(6)}.json`);
		await Bun.write(jsonPath, JSON.stringify({ otra: { cosa: true } }));
		const [error] = await cmdSetup(tmpFile(), jsonPath);
		expect(error?.code).toBe('SETUP_FAILED');
	});
});
