import { describe, it, expect } from 'bun:test';
import { pkceChallenge, randomString, buildAuthUrl, exchangeCode, refreshAccessToken } from '../src/oauth.ts';

const CLIENT = { clientId: 'id-test', clientSecret: 'sec-test' };

describe('oauth', () => {
	describe('pkceChallenge', () => {
		it('debería coincidir con el vector de prueba RFC 7636', () => {
			expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
				'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
			);
		});
	});

	describe('randomString', () => {
		it('debería generar valores únicos y sin caracteres problemáticos', () => {
			const a = randomString(64);
			const b = randomString(64);
			expect(a).not.toBe(b);
			expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
			expect(a.length).toBeGreaterThan(80);
		});
	});

	describe('buildAuthUrl', () => {
		it('debería incluir todos los parámetros requeridos', () => {
			const url = new URL(buildAuthUrl({ clientId: 'c1', redirectUri: 'http://127.0.0.1:9/cb', state: 's1', challenge: 'ch1' }));
			expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
			expect(url.searchParams.get('client_id')).toBe('c1');
			expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:9/cb');
			expect(url.searchParams.get('code_challenge_method')).toBe('S256');
			expect(url.searchParams.get('access_type')).toBe('offline');
			expect(url.searchParams.get('prompt')).toBe('consent');
			expect(url.searchParams.get('scope')).toContain('drive.file');
		});
	});

	describe('exchangeCode', () => {
		it('debería intercambiar código por tokens', async () => {
			let captured = '';
			const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
				captured = String(init?.body);
				return new Response(JSON.stringify({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				});
			}) as unknown as typeof fetch;

			const [error, tokens] = await exchangeCode(
				CLIENT,
				{ code: 'codigo-1', verifier: 'ver-1', redirectUri: 'http://127.0.0.1:1/cb' },
				mockFetch,
			);
			expect(error).toBeNull();
			expect(tokens?.accessToken).toBe('at-1');
			expect(tokens?.refreshToken).toBe('rt-1');
			const params = new URLSearchParams(captured);
			expect(params.get('grant_type')).toBe('authorization_code');
			expect(params.get('code')).toBe('codigo-1');
			expect(params.get('code_verifier')).toBe('ver-1');
			expect(params.get('client_secret')).toBe('sec-test');
		});

		it('debería manejar error de Google', async () => {
			const mockFetch = (async () =>
				new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'código vencido' }), {
					status: 400,
					headers: { 'content-type': 'application/json' },
				})) as unknown as typeof fetch;

			const [error] = await exchangeCode(CLIENT, { code: 'x', verifier: 'y', redirectUri: 'z' }, mockFetch);
			expect(error?.code).toBe('AUTH_FAILED');
			expect(error?.detail).toContain('vencido');
		});
	});

	describe('refreshAccessToken', () => {
		it('debería renovar el token conservando el refresh token original', async () => {
			const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
				expect(String(init?.body)).toContain('grant_type=refresh_token');
				return new Response(JSON.stringify({ access_token: 'at-nuevo', expires_in: 1800 }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				});
			}) as unknown as typeof fetch;

			const [error, tokens] = await refreshAccessToken(CLIENT, 'rt-viejo', mockFetch);
			expect(error).toBeNull();
			expect(tokens?.accessToken).toBe('at-nuevo');
			expect(tokens?.refreshToken).toBe('rt-viejo');
		});

		it('debería devolver TOKEN_REFRESH_FAILED si el refresh token fue revocado', async () => {
			const mockFetch = (async () =>
				new Response(JSON.stringify({ error: 'invalid_grant' }), {
					status: 400,
					headers: { 'content-type': 'application/json' },
				})) as unknown as typeof fetch;

			const [error] = await refreshAccessToken(CLIENT, 'rt', mockFetch);
			expect(error?.code).toBe('TOKEN_REFRESH_FAILED');
		});
	});
});
