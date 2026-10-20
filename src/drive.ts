import { err, ok, type Result } from './result.ts';
import type { FetchLike } from './oauth.ts';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
export const ROOT_FOLDER_NAME = 'Office2Google';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Archivo mínimo de Drive. */
export interface DriveFile {
	id: string;
	name: string;
	mimeType?: string;
	webViewLink?: string;
}

/** Escapa valores para usar dentro de una query de Drive ('...' ). */
export function escapeQuery(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const authHeaders = (token: string): Record<string, string> => ({
	Authorization: `Bearer ${token}`,
	'content-type': 'application/json',
});

async function apiError(res: Response): Promise<string> {
	try {
		const data = (await res.json()) as { error?: { message?: string } };
		return data.error?.message ?? `HTTP ${res.status}`;
	} catch {
		return `HTTP ${res.status}`;
	}
}

/**
 * Mapea un error de la API de Drive.
 * Un 401 significa que la sesión ya no vale (caducó o se revocó) → código propio
 * para que la capa de arriba pueda reautorizar en vez de mostrar un error confuso.
 */
async function apiErr(
	code: 'DRIVE_ERROR' | 'FOLDER_ERROR' | 'UPLOAD_ERROR',
	res: Response,
	message: string,
): Promise<import('./result.ts').AppError> {
	const detail = await apiError(res);
	if (res.status === 401) {
		return {
			code: 'AUTH_EXPIRED',
			message: 'La sesión de Google ya no es válida (caducó o se revocó)',
			detail,
		};
	}
	return { code, message, detail };
}

/** Busca archivos con un nombre exacto dentro de una carpeta. */
export async function findFilesByName(
	token: string,
	folderId: string,
	name: string,
	fetchFn: FetchLike = fetch,
): Promise<Result<DriveFile[]>> {
	const q = `'${escapeQuery(folderId)}' in parents and name = '${escapeQuery(name)}' and trashed = false`;
	const url = `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink)&pageSize=10`;
	try {
		const res = await fetchFn(url, { headers: authHeaders(token) });
		if (!res.ok) return [await apiErr('DRIVE_ERROR', res, 'No se pudo buscar en Drive'), null];
		const data = (await res.json()) as { files?: DriveFile[] };
		return ok(data.files ?? []);
	} catch (e) {
		return err('DRIVE_ERROR', 'No se pudo conectar con Drive', String(e));
	}
}

/** Valida (o recrea) la carpeta destino; usa el id cacheado si sigue viva. */
export async function ensureFolder(
	token: string,
	cachedId: string | undefined,
	fetchFn: FetchLike = fetch,
): Promise<Result<string>> {
	if (cachedId) {
		const res = await fetchFn(`${API}/files/${encodeURIComponent(cachedId)}?fields=id`, {
			headers: authHeaders(token),
		}).catch(() => null);
		if (res?.ok) return ok(cachedId);
		// 401: la sesion ya no vale -> que la capa de arriba reautorice
		if (res?.status === 401) {
			return err('AUTH_EXPIRED', 'La sesión de Google ya no es válida (caducó o se revocó)');
		}
		if (res && res.status !== 404 && res.status !== 403) {
			return err('FOLDER_ERROR', 'No se pudo verificar la carpeta destino', await apiError(res));
		}
	}

	const search = await findFilesByName(token, 'root', ROOT_FOLDER_NAME, fetchFn);
	if (search[0]) return [search[0], null];
	const existing = search[1].find((f) => f.mimeType === FOLDER_MIME);
	if (existing) return ok(existing.id);

	try {
		const res = await fetchFn(`${API}/files?fields=id`, {
			method: 'POST',
			headers: authHeaders(token),
			body: JSON.stringify({ name: ROOT_FOLDER_NAME, mimeType: FOLDER_MIME, parents: ['root'] }),
		});
		if (!res.ok) return err('FOLDER_ERROR', 'No se pudo crear la carpeta en Drive', await apiError(res));
		const data = (await res.json()) as { id?: string };
		if (!data.id) return err('FOLDER_ERROR', 'Drive devolvió una respuesta sin id');
		return ok(data.id);
	} catch (e) {
		return err('FOLDER_ERROR', 'No se pudo crear la carpeta en Drive', String(e));
	}
}

/** Sube un archivo local a Drive (multipart, streaming del archivo). */
export async function uploadFile(
	token: string,
	p: { filePath: string; name: string; mimeType: string; folderId: string },
	fetchFn: FetchLike = fetch,
): Promise<Result<DriveFile>> {
	const meta = { name: p.name, parents: [p.folderId], mimeType: p.mimeType };
	const form = new FormData();
	form.append(
		'metadata',
		new Blob([JSON.stringify(meta)], { type: 'application/json; charset=UTF-8' }),
	);
	form.append('file', new File([Bun.file(p.filePath)], p.name));

	try {
		const res = await fetchFn(`${UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,webViewLink`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			body: form,
		});
		if (!res.ok) return [await apiErr('UPLOAD_ERROR', res, `No se pudo subir "${p.name}" a Drive`), null];
		const data = (await res.json()) as DriveFile;
		if (!data.id) return err('UPLOAD_ERROR', 'Drive devolvió una respuesta sin id');
		return ok(data);
	} catch (e) {
		return err('UPLOAD_ERROR', `No se pudo subir "${p.name}" a Drive`, String(e));
	}
}
