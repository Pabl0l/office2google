import { err, ok, type Result } from './result.ts';
import { existsSync } from 'node:fs';

/** URL de editor de Google (id controlado por Drive — charset estricto anti-injection). */
const EDITOR_URL = /^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/[A-Za-z0-9_-]+\/edit$/;
/** URL de consentimiento OAuth construida por nosotros con URLSearchParams. */
const AUTH_URL = /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?[A-Za-z0-9&=:%?/.+_~-]+$/;

export type Spawner = (args: string[]) => Promise<void>;

/** Rutas habituales de los navegadores soportados por la variable `O2G_BROWSER`. */
export const BROWSER_PATHS: Record<string, string[]> = {
	chrome: [
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
	],
	edge: [
		'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
		'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
	],
	brave: ['C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
	firefox: [
		'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
		'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
	],
};

/** Argumento para abrir la URL en una ventana propia (no en una pestaña existente). */
export const BROWSER_NEW_WINDOW: Record<string, string> = {
	chrome: '--new-window',
	edge: '--new-window',
	brave: '--new-window',
	firefox: '-new-window',
};

/**
 * Navegador forzado con `O2G_BROWSER` (chrome|edge|brave|firefox).
 * Útil cuando el navegador por defecto de Windows no es el que quieres usar.
 * Devuelve `undefined` si no se pide ninguno o si no está instalado.
 */
export function forcedBrowser(
	env: Record<string, string | undefined> = process.env,
	exists: (path: string) => boolean = existsSync,
): string | undefined {
	const key = env.O2G_BROWSER?.trim().toLowerCase();
	if (!key) return undefined;
	const candidates = BROWSER_PATHS[key];
	if (!candidates) return undefined;
	return candidates.find((p) => exists(p));
}

/**
 * Abre una URL en el navegador por defecto (rundll32: sin cmd, evita expansión de
 * % y separación por & en URLs con query; fallback a PowerShell lo decide openUrl).
 */
export const windowsOpen: Spawner = async (args) => {
	const proc = Bun.spawn(args, { stdout: 'ignore', stderr: 'ignore' });
	const code = await proc.exited;
	if (code !== 0) throw new Error(`proceso cerró con código ${code}`);
};

/** Abre una URL validada (solo editors Google o consentimiento OAuth) en el navegador. */
export async function openUrl(
	url: string,
	spawn: Spawner = windowsOpen,
	env: Record<string, string | undefined> = process.env,
): Promise<Result<null>> {
	if (!EDITOR_URL.test(url) && !AUTH_URL.test(url)) {
		return err('BROWSER_ERROR', 'URL de destino no válida', url);
	}
	// Navegador forzado por el usuario (O2G_BROWSER): tiene prioridad sobre el del sistema.
	const forced = forcedBrowser(env);
	if (forced) {
		const key = env.O2G_BROWSER?.trim().toLowerCase() ?? '';
		// ventana propia: deja la URL visible y no pisa las pestanas del usuario
		const winArg = BROWSER_NEW_WINDOW[key] ?? '--new-window';
		try {
			await spawn([forced, winArg, url]);
			return ok(null);
		} catch {
			// cae al metodo por defecto
		}
	}
	try {
		await spawn(['rundll32.exe', 'url.dll,FileProtocolHandler', url]);
	} catch {
		try {
			await spawn(['powershell.exe', '-NoProfile', '-Command', `Start-Process '${url}'`]);
		} catch (e) {
			return err('BROWSER_ERROR', 'No se pudo abrir el navegador', String(e));
		}
	}
	return ok(null);
}
