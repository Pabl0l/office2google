import { join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { err, ok, type Result } from './result.ts';

/** Tokens OAuth de Google. */
export interface TokenSet {
	accessToken: string;
	refreshToken?: string;
	/** Epoch ms en el que expira el access token. */
	expiresAt: number;
}

/** Configuración persistente de la app. */
export interface AppConfig {
	clientId?: string;
	clientSecret?: string;
	/** Id de la carpeta "Office2Google" en Drive (cacheado). */
	folderId?: string;
	tokens?: TokenSet;
}

/** Ruta por defecto del config: %APPDATA%\office2google\config.json. */
export function defaultConfigPath(env: Record<string, string | undefined> = process.env): string {
	const base = env.APPDATA ?? env.HOME ?? env.TMP ?? '.';
	return join(base, 'office2google', 'config.json');
}

/** Lee el config; si no existe devuelve config vacía. */
export async function loadConfig(path: string): Promise<Result<AppConfig>> {
	try {
		const file = Bun.file(path);
		if (!(await file.exists())) return ok<AppConfig>({});
		const data: unknown = JSON.parse(await file.text());
		if (typeof data !== 'object' || data === null || Array.isArray(data)) {
			return err('CONFIG_ERROR', 'El archivo de configuración está corrupto', path);
		}
		return ok(data as AppConfig);
	} catch (e) {
		return err('CONFIG_ERROR', 'No se pudo leer la configuración', String(e));
	}
}

/** Guarda el config (crea directorios, escritura atómica básica). */
export async function saveConfig(path: string, cfg: AppConfig): Promise<Result<null>> {
	try {
		await mkdir(dirname(path), { recursive: true });
		await Bun.write(path, JSON.stringify(cfg, null, '\t'));
		return ok(null);
	} catch (e) {
		return err('CONFIG_ERROR', 'No se pudo guardar la configuración', String(e));
	}
}

/** True si el access token expira (con 60s de margen) o no existe. */
export function tokensExpired(tokens: TokenSet | undefined, now = Date.now()): boolean {
	if (!tokens) return true;
	return now >= tokens.expiresAt - 60_000;
}
