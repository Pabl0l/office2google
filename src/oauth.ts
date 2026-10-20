import { createHash, randomBytes } from 'node:crypto';
import { err, ok, type Result } from './result.ts';
import type { TokenSet } from './config.ts';
import { openUrl } from './browser.ts';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
/** Alcance mínimo: solo archivos creados por esta app (principio de mínimo privilegio). */
export const SCOPES = 'https://www.googleapis.com/auth/drive.file';

export type FetchLike = typeof fetch;

/** Credenciales OAuth del cliente (Desktop). */
export interface OAuthClient {
	clientId: string;
	clientSecret: string;
}

/** Genera un string aleatorio base64url de n bytes. */
export function randomString(n = 32): string {
	return randomBytes(n).toString('base64url');
}

/** Calcula el challenge PKCE S256 (base64url del sha256 del verifier). */
export function pkceChallenge(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

/** Construye la URL de consentimiento de Google. */
export function buildAuthUrl(p: {
	clientId: string;
	redirectUri: string;
	state: string;
	challenge: string;
}): string {
	const q = new URLSearchParams({
		client_id: p.clientId,
		redirect_uri: p.redirectUri,
		response_type: 'code',
		scope: SCOPES,
		access_type: 'offline',
		prompt: 'consent',
		state: p.state,
		code_challenge: p.challenge,
		code_challenge_method: 'S256',
	});
	return `${AUTH_ENDPOINT}?${q.toString()}`;
}

/** Intercambia el código de autorización por tokens. */
export async function exchangeCode(
	client: OAuthClient,
	p: { code: string; verifier: string; redirectUri: string },
	fetchFn: FetchLike = fetch,
): Promise<Result<TokenSet>> {
	const body = new URLSearchParams({
		code: p.code,
		client_id: client.clientId,
		client_secret: client.clientSecret,
		redirect_uri: p.redirectUri,
		grant_type: 'authorization_code',
		code_verifier: p.verifier,
	});
	return requestTokens(body, 'AUTH_FAILED', 'No se pudo completar el login con Google', fetchFn);
}

/** Renueva el access token usando el refresh token. */
export async function refreshAccessToken(
	client: OAuthClient,
	refreshToken: string,
	fetchFn: FetchLike = fetch,
): Promise<Result<TokenSet>> {
	const body = new URLSearchParams({
		refresh_token: refreshToken,
		client_id: client.clientId,
		client_secret: client.clientSecret,
		grant_type: 'refresh_token',
	});
	const [error, tokens] = await requestTokens(
		body,
		'TOKEN_REFRESH_FAILED',
		'No se pudo renovar la sesión de Google',
		fetchFn,
	);
	if (error) return [error, null];
	return ok<TokenSet>({ ...tokens, refreshToken: tokens.refreshToken ?? refreshToken });
}

async function requestTokens(
	body: URLSearchParams,
	code: 'AUTH_FAILED' | 'TOKEN_REFRESH_FAILED',
	message: string,
	fetchFn: FetchLike,
): Promise<Result<TokenSet>> {
	try {
		const res = await fetchFn(TOKEN_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: body.toString(),
		});
		const data = (await res.json()) as Record<string, unknown>;
		if (!res.ok || typeof data.access_token !== 'string') {
			const detail = String(data.error_description ?? data.error ?? `HTTP ${res.status}`);
			return err(code, message, detail);
		}
		return ok<TokenSet>({
			accessToken: data.access_token,
			refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
			expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
		});
	} catch (e) {
		return err(code, message, String(e));
	}
}

/**
 * Flujo interactivo completo: servidor loopback + navegador + intercambio de código.
 * Se resuelve cuando el usuario aprueba el acceso en Google.
 */
export async function interactiveAuth(
	client: OAuthClient,
	deps: {
		fetchFn?: FetchLike;
		opener?: (url: string) => Promise<Result<null>>;
		timeoutMs?: number;
	} = {},
): Promise<Result<TokenSet>> {
	const fetchFn = deps.fetchFn ?? fetch;
	const opener = deps.opener ?? openUrl;
	const timeoutMs = deps.timeoutMs ?? 300_000;
	const verifier = randomString(64);
	const state = randomString(16);

	type Pending = { code?: string; state?: string; error?: string };
	let settle: (p: Pending) => void = () => {};
	const pending = new Promise<Pending>((resolve) => (settle = resolve));

	const server = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		fetch(req) {
			const url = new URL(req.url);
			if (url.pathname !== '/callback') return new Response('Not found', { status: 404 });
			settle({
				code: url.searchParams.get('code') ?? undefined,
				state: url.searchParams.get('state') ?? undefined,
				error: url.searchParams.get('error') ?? undefined,
			});
			return new Response(
				'<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">' +
					'<h2>Listo &#9989;</h2><p>Puedes cerrar esta pesta&#241;a y volver a tu archivo.</p>',
				{ headers: { 'content-type': 'text/html; charset=utf-8' } },
			);
		},
	});

	const redirectUri = `http://127.0.0.1:${server.port}/callback`;
	const authUrl = buildAuthUrl({
		clientId: client.clientId,
		redirectUri,
		state,
		challenge: pkceChallenge(verifier),
	});

	const [openErr] = await opener(authUrl);
	if (openErr) {
		server.stop(true);
		return [openErr, null];
	}

	const timer = setTimeout(() => settle({ error: 'timeout' }), timeoutMs);
	const res = await pending;
	clearTimeout(timer);
	server.stop(true);

	if (res.error || !res.code) {
		return err('AUTH_FAILED', 'No se completó la autorización de Google', res.error ?? 'sin código');
	}
	if (res.state !== state) {
		return err('AUTH_FAILED', 'Respuesta de estado inválida (posible interceptación)', res.state);
	}
	return exchangeCode(client, { code: res.code, verifier, redirectUri }, fetchFn);
}
