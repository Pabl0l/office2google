import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Escribe una línea en el log de la app (best-effort, nunca rompe el flujo). */
export async function writeLog(logDir: string, msg: string): Promise<void> {
	try {
		const path = join(logDir, 'office2google.log');
		await mkdir(dirname(path), { recursive: true });
		await appendFile(path, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
	} catch {
		// el logging nunca debe tumbar la app
	}
}
