/**
 * Credenciales del cliente OAuth embebidas en la app (GENERADO — no editar a mano).
 *
 * Este archivo es un PLACEHOLDER vacío. Tu repo público NO debe contener el
 * client_secret real. Genera tu copia local con:
 *
 *   bun run creds "C:\ruta\client_secret_xxx.json"
 *
 * Tras generarlo, marca el archivo para que git no lo suba nunca:
 *
 *   git update-index --skip-worktree src/client_credentials.ts
 *   # para editarlo después: git update-index --no-skip-worktree src/client_credentials.ts
 *
 * NOTA DE SEGURIDAD: el `client_secret` de una app de escritorio NO es confidencial
 * por diseño de Google — viaja dentro del binario distribuido. Lo que protege el flujo
 * es PKCE S256 + redirect a 127.0.0.1 + scope `drive.file`.
 * NUNCA embeber aquí tokens de usuario: viven en %APPDATA%\office2google\config.json.
 *
 * Si ambas cadenas están vacías, la app sigue funcionando si hay un `client_secret.json`
 * junto al exe o si se usó `office2google setup <json>`.
 */
export const EMBEDDED_CLIENT_ID = '';
export const EMBEDDED_CLIENT_SECRET = '';
