import { describe, it, expect, afterEach } from 'bun:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomString } from '../src/oauth.ts';
import {
	candidateClientDirs,
	loadClient,
	parseClientJson,
	readClientFile,
	resolveClient,
} from '../src/client_source.ts';

const tmpDir = () => join(tmpdir(), 'o2g-client', randomString(8));
const cleanup: string[] = [];
afterEach(async () => {
	const { rm } = await import('node:fs/promises');
	for (const dir of cleanup.splice(0)) {
		await rm(dir, { recursive: true, force: true });
	}
});

const CFG = { clientId: 'id-config', clientSecret: 'sec-config' };
const EMB = { clientId: 'id-embedded', clientSecret: 'sec-embedded' };
const FILE = { clientId: 'id-file', clientSecret: 'sec-file' };

describe('client_source.resolveClient', () => {
	it('debería priorizar setup > embebidas > json junto al exe', () => {
		expect(resolveClient({ fromConfig: CFG, fromEmbedded: EMB, fromFile: FILE })).toEqual({
			...CFG,
			source: 'config',
		});
		expect(resolveClient({ fromEmbedded: EMB, fromFile: FILE })).toEqual({ ...EMB, source: 'embedded' });
		expect(resolveClient({ fromFile: FILE })).toEqual({ ...FILE, source: 'file' });
	});

	it('debería descartar fuentes incompletas (sin client_secret no sirve)', () => {
		expect(resolveClient({ fromConfig: { clientId: 'solo-id' }, fromEmbedded: EMB })).toEqual({
			...EMB,
			source: 'embedded',
		});
		expect(resolveClient({ fromConfig: { clientSecret: 'solo-secret' } })).toBeNull();
		expect(resolveClient({})).toBeNull();
		expect(resolveClient({ fromConfig: { clientId: '', clientSecret: '' } })).toBeNull();
	});
});

describe('client_source.parseClientJson', () => {
	it('debería extraer credenciales del formato installed', () => {
		const raw = JSON.stringify({ installed: { client_id: 'i1', client_secret: 's1', auth_uri: 'x' } });
		expect(parseClientJson(raw)).toEqual({ clientId: 'i1', clientSecret: 's1' });
	});

	it('debería aceptar el formato web como alternativa', () => {
		expect(parseClientJson(JSON.stringify({ web: { client_id: 'i2', client_secret: 's2' } }))).toEqual({
			clientId: 'i2',
			clientSecret: 's2',
		});
	});

	it('debería rechazar JSON roto o sin credenciales completas', () => {
		expect(parseClientJson('{no-es-json')).toBeNull();
		expect(parseClientJson('null')).toBeNull();
		expect(parseClientJson(JSON.stringify({ installed: { client_id: 'i' } }))).toBeNull();
		expect(parseClientJson(JSON.stringify({ otra: { x: 1 } }))).toBeNull();
	});
});

describe('client_source.lectura del json junto al exe', () => {
	it('debería leer client_secret.json del primer directorio válido', async () => {
		const dir = tmpDir();
		cleanup.push(dir);
		await Bun.write(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'i3', client_secret: 's3' } }));
		const creds = await readClientFile([join(tmpdir(), 'no-existe-' + randomString(4)), dir]);
		expect(creds).toEqual({ clientId: 'i3', clientSecret: 's3' });
	});

	it('debería ignorar un json inválido y seguir buscando', async () => {
		const bad = tmpDir();
		cleanup.push(bad);
		await Bun.write(join(bad, 'client_secret.json'), '{roto');
		expect(await readClientFile([bad, join(tmpdir(), 'no-existe-' + randomString(4))])).toBeUndefined();
	});

	it('loadClient debería resolver desde el json cuando no hay setup ni embebidas', async () => {
		const dir = tmpDir();
		cleanup.push(dir);
		await Bun.write(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'i4', client_secret: 's4' } }));
		const resolved = await loadClient({}, { dirs: [dir], embedded: {} });
		expect(resolved).toEqual({ clientId: 'i4', clientSecret: 's4', source: 'file' });
	});

	it('loadClient debería usar las embebidas si no hay setup ni json', async () => {
		const resolved = await loadClient({}, { dirs: [join(tmpdir(), 'no-existe')], embedded: { clientId: 'e1', clientSecret: 'e2' } });
		expect(resolved).toEqual({ clientId: 'e1', clientSecret: 'e2', source: 'embedded' });
	});

	it('loadClient debería dar prioridad al config del usuario sobre el json', async () => {
		const dir = tmpDir();
		cleanup.push(dir);
		await Bun.write(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'otro', client_secret: 'otro' } }));
		const resolved = await loadClient({ clientId: 'mio', clientSecret: 'mio' }, { dirs: [dir], embedded: { clientId: 'e', clientSecret: 'e' } });
		expect(resolved).toEqual({ clientId: 'mio', clientSecret: 'mio', source: 'config' });
	});

	it('candidateClientDirs debería incluir la carpeta del exe y el cwd, sin duplicados', () => {
		const dirs = candidateClientDirs({ execPath: 'C:\\app\\office2google.exe', cwd: 'C:\\app' });
		expect(dirs).toEqual(['C:\\app']);
		expect(candidateClientDirs({ execPath: 'C:\\app\\o.exe', cwd: 'C:\\otro' })).toEqual([
			'C:\\app',
			'C:\\otro',
		]);
	});
});
