/**
 * Genera `src/client_credentials.ts` a partir del JSON descargado de Google Cloud.
 *
 *   bun run creds "C:\ruta\descargas\client_secret_xxx.json"
 *
 * Solo extrae client_id/client_secret (app). Nunca toca tokens de usuario.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseClientJson } from '../src/client_source.ts';

const jsonPath = process.argv[2];
const outFile = join(import.meta.dir, '..', 'src', 'client_credentials.ts');

if (!jsonPath) {
	console.error('Uso: bun run creds "C:\\ruta\\client_secret_xxx.json"');
	process.exit(1);
}

let text: string;
try {
	const file = Bun.file(jsonPath);
	if (!(await file.exists())) {
		console.error(`✗ No existe el archivo: ${jsonPath}`);
		process.exit(1);
	}
	text = await file.text();
} catch (e) {
	console.error(`✗ No se pudo leer el JSON: ${String(e)}`);
	process.exit(1);
}

const creds = parseClientJson(text);
if (!creds) {
	console.error('✗ El JSON no contiene client_id/client_secret válidos (formato installed/web)');
	process.exit(1);
}

const header = `/**
 * Credenciales del cliente OAuth embebidas en la app (GENERADO — no editar a mano).
 *
 * Regenerar con:  bun run creds "C:\\ruta\\client_secret_xxx.json"
 *
 * NOTA DE SEGURIDAD: el \`client_secret\` de una app de escritorio NO es confidencial
 * por diseño de Google — viaja dentro del binario distribuido. Lo que protege el flujo
 * es PKCE S256 + redirect a 127.0.0.1 + scope \`drive.file\`.
 * NUNCA embeber aquí tokens de usuario: viven en %APPDATA%\\office2google\\config.json.
 *
 * Si haces el repo público: añade este archivo a \`.gitignore\` y corre \`bun run creds\`
 * tras clonar.
 */
export const EMBEDDED_CLIENT_ID = ${JSON.stringify(creds.clientId)};
export const EMBEDDED_CLIENT_SECRET = ${JSON.stringify(creds.clientSecret)};
`;

await writeFile(outFile, header, 'utf8');
console.log(`✓ Credenciales embebidas en src/client_credentials.ts`);
console.log(`  client_id: ${creds.clientId.slice(0, 40)}…`);
console.log('  Siguiente: bun run build');
