import { err, ok, type Result } from './result.ts';

/** URL de editor de Google (id controlado por Drive — charset estricto anti-injection). */
const EDITOR_URL = /^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/[A-Za-z0-9_-]+\/edit$/;
/** URL de consentimiento OAuth construida por nosotros con URLSearchParams. */
const AUTH_URL = /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?[A-Za-z0-9&=:%?/.+_~-]+$/;

export type Spawner = (args: string[]) => Promise<void>;

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
export async function openUrl(url: string, spawn: Spawner = windowsOpen): Promise<Result<null>> {
	if (!EDITOR_URL.test(url) && !AUTH_URL.test(url)) {
		return err('BROWSER_ERROR', 'URL de destino no válida', url);
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
