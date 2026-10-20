import { describe, it, expect } from 'bun:test';
import { escapeQuery, findFilesByName, ensureFolder, uploadFile, ROOT_FOLDER_NAME, FOLDER_MIME } from '../src/drive.ts';

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('drive', () => {
	describe('escapeQuery', () => {
		it('debería escapar comillas simples y backslashes', () => {
			expect(escapeQuery("informe's")).toBe("informe\\'s");
			expect(escapeQuery('a\\b')).toBe('a\\\\b');
			expect(escapeQuery('normal.docx')).toBe('normal.docx');
		});
	});

	describe('findFilesByName', () => {
		it('debería buscar por nombre exacto dentro de la carpeta', async () => {
			let capturedUrl = '';
			const mockFetch = (async (url: string | URL | Request) => {
				capturedUrl = String(url);
				return json({ files: [{ id: 'f1', name: 'informe.docx' }] });
			}) as unknown as typeof fetch;

			const [error, files] = await findFilesByName('tok', 'folder1', 'informe.docx', mockFetch);
			expect(error).toBeNull();
			expect(files).toHaveLength(1);
			expect(decodeURIComponent(capturedUrl)).toContain("'folder1' in parents");
			expect(decodeURIComponent(capturedUrl)).toContain("name = 'informe.docx'");
		});

		it('debería devolver error DRIVE_ERROR en fallo de API', async () => {
			const mockFetch = (async () => json({ error: { message: 'cuota excedida' } }, 403)) as unknown as typeof fetch;
			const [error] = await findFilesByName('tok', 'f', 'a.docx', mockFetch);
			expect(error?.code).toBe('DRIVE_ERROR');
			expect(error?.detail).toContain('cuota');
		});

		it('debería devolver AUTH_EXPIRED si Google responde 401 (sesión revocada)', async () => {
			const mockFetch = (async () => json({ error: { message: 'Invalid Credentials' } }, 401)) as unknown as typeof fetch;
			const [error] = await findFilesByName('tok', 'f', 'a.docx', mockFetch);
			expect(error?.code).toBe('AUTH_EXPIRED');
			expect(error?.detail).toContain('Invalid Credentials');
		});
	});

	describe('ensureFolder', () => {
		it('debería reusar el id cacheado si sigue vivo', async () => {
			const mockFetch = (async () => json({ id: 'folder-viva' })) as unknown as typeof fetch;
			const [error, id] = await ensureFolder('tok', 'folder-viva', mockFetch);
			expect(error).toBeNull();
			expect(id).toBe('folder-viva');
		});

		it('debería buscar la carpeta si el cacheado murió (404)', async () => {
			let step = 0;
			const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
				if (init?.method === undefined) {
					step++;
					if (step === 1) return json({ error: { message: 'not found' } }, 404); // get cacheado
					return json({ files: [{ id: 'folder-buena', mimeType: FOLDER_MIME, name: ROOT_FOLDER_NAME }] });
				}
				return json({ id: 'nueva' }, 200); // no debe llegar a crear
			}) as unknown as typeof fetch;

			const [error, id] = await ensureFolder('tok', 'muerta', mockFetch);
			expect(error).toBeNull();
			expect(id).toBe('folder-buena');
		});

		it('debería devolver AUTH_EXPIRED si la carpeta cacheada responde 401', async () => {
			const mockFetch = (async () => json({ error: { message: 'Invalid Credentials' } }, 401)) as unknown as typeof fetch;
			const [error] = await ensureFolder('tok', 'folder-cacheada', mockFetch);
			expect(error?.code).toBe('AUTH_EXPIRED');
		});

		it('debería crear la carpeta si no existe ninguna', async () => {
			const captured: { value: Record<string, unknown> | null } = { value: null };
			const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
				if (init?.method === 'POST' && String(url).includes('/files?')) {
					captured.value = JSON.parse(String(init.body));
					return json({ id: 'recien-creada' });
				}
				return json({ files: [] }); // búsqueda
			}) as unknown as typeof fetch;

			const [error, id] = await ensureFolder('tok', undefined, mockFetch);
			expect(error).toBeNull();
			expect(id).toBe('recien-creada');
			expect(captured.value?.name).toBe(ROOT_FOLDER_NAME);
			expect(captured.value?.mimeType).toBe(FOLDER_MIME);
			expect(captured.value?.parents).toEqual(['root']);
		});
	});

	describe('uploadFile', () => {
		it('debería subir multipart con metadata correcta', async () => {
			let capturedUrl = '';
			let capturedAuth = '';
			let meta: Record<string, unknown> = {};
			const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
				capturedUrl = String(url);
				capturedAuth = String((init?.headers as Record<string, string>)?.Authorization);
				const form = init?.body as FormData;
				const metaBlob = form.get('metadata') as Blob;
				meta = JSON.parse(await metaBlob.text());
				expect(form.get('file')).not.toBeNull();
				expect(form.get('file')).toHaveProperty('name', 'informe.docx');
				return json({ id: 'drive-1', name: 'informe.docx' });
			}) as unknown as typeof fetch;

			const [error, file] = await uploadFile(
				'tok-abc',
				{ filePath: 'C:\\tmp\\informe.docx', name: 'informe.docx', mimeType: 'application/msword', folderId: 'fold1' },
				mockFetch,
			);
			expect(error).toBeNull();
			expect(file?.id).toBe('drive-1');
			expect(capturedUrl).toContain('uploadType=multipart');
			expect(capturedAuth).toBe('Bearer tok-abc');
			expect(meta.name).toBe('informe.docx');
			expect(meta.folderId).toBeUndefined();
			expect(meta.parents).toEqual(['fold1']);
			expect(meta.mimeType).toBe('application/msword');
		});

		it('debería devolver UPLOAD_ERROR si Drive rechaza', async () => {
			const mockFetch = (async () => json({ error: { message: 'permiso denegado' } }, 403)) as unknown as typeof fetch;
			const [error] = await uploadFile('tok', { filePath: 'x', name: 'x.docx', mimeType: 'm', folderId: 'f' }, mockFetch);
			expect(error?.code).toBe('UPLOAD_ERROR');
			expect(error?.detail).toContain('permiso');
		});

		it('debería devolver AUTH_EXPIRED si la subida responde 401', async () => {
			const mockFetch = (async () => json({ error: { message: 'Invalid Credentials' } }, 401)) as unknown as typeof fetch;
			const [error] = await uploadFile('tok', { filePath: 'x', name: 'x.docx', mimeType: 'm', folderId: 'f' }, mockFetch);
			expect(error?.code).toBe('AUTH_EXPIRED');
		});
	});
});
