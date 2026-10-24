import { vi } from 'vitest';
import type { Auth } from '../index';

// A minimal OIDC provider behind a stubbed fetch, so tests can sign in with the real Better Auth.
const ISSUER = 'https://provider.test';
const b64 = (value: unknown) =>
	Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

export type MockIdp = Awaited<ReturnType<typeof mockIdp>>;

export async function mockIdp() {
	const keys = await crypto.subtle.generateKey(
		{
			name: 'RSASSA-PKCS1-v1_5',
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: 'SHA-256'
		},
		true,
		['sign', 'verify']
	);
	const jwk = {
		...(await crypto.subtle.exportKey('jwk', keys.publicKey)),
		kid: 'k1',
		alg: 'RS256',
		use: 'sig'
	};
	const codes = new Map<string, { sub: string; nonce: string | null }>();
	const idToken = async (sub: string, nonce: string | null) => {
		const now = Math.floor(Date.now() / 1000);
		const claims = {
			iss: ISSUER,
			aud: 'client',
			sub,
			email: `${sub}@example.test`,
			email_verified: true,
			name: sub,
			iat: now,
			exp: now + 3600,
			...(nonce ? { nonce } : {})
		};
		const input = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64(claims)}`;
		const signature = await crypto.subtle.sign(
			'RSASSA-PKCS1-v1_5',
			keys.privateKey,
			new TextEncoder().encode(input)
		);
		return `${input}.${Buffer.from(signature).toString('base64url')}`;
	};
	vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		if (url.pathname === '/.well-known/openid-configuration') {
			return Response.json({
				issuer: ISSUER,
				authorization_endpoint: `${ISSUER}/authorize`,
				token_endpoint: `${ISSUER}/token`,
				jwks_uri: `${ISSUER}/jwks`,
				id_token_signing_alg_values_supported: ['RS256']
			});
		}
		if (url.pathname === '/jwks') return Response.json({ keys: [jwk] });
		if (url.pathname !== '/token') throw new Error(`Unexpected fetch: ${url}`);
		const body = new URLSearchParams(String(init.body));
		const grant =
			body.get('grant_type') === 'refresh_token'
				? { sub: body.get('refresh_token')!.slice('refresh-'.length), nonce: null }
				: codes.get(body.get('code')!)!;
		return Response.json({
			access_token: `access-${grant.sub}`,
			refresh_token: `refresh-${grant.sub}`,
			id_token: await idToken(grant.sub, grant.nonce),
			expires_in: 3600,
			token_type: 'Bearer'
		});
	});
	return { codes };
}

export type Jar = Map<string, string>;

export const cookieHeaders = (jar: Jar) =>
	new Headers({ cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') });

function applySetCookies(jar: Jar, headers: Headers) {
	for (const line of headers.getSetCookie()) {
		const [pair, ...attributes] = line.split(';');
		const name = pair.slice(0, pair.indexOf('=')).trim();
		const value = pair.slice(pair.indexOf('=') + 1).trim();
		if (!value || attributes.some((attribute) => /max-age=0\b/i.test(attribute))) jar.delete(name);
		else jar.set(name, value);
	}
}

/** Runs the full OIDC sign-in for `sub` and returns the resulting auth cookies. */
export async function signIn(auth: Auth, idp: MockIdp, sub: string): Promise<Jar> {
	const jar: Jar = new Map();
	const start = await auth.api.signInSocial({
		body: { provider: 'oidc', callbackURL: '/' },
		headers: new Headers(),
		returnHeaders: true
	});
	applySetCookies(jar, start.headers);
	const authorize = new URL(start.response.url!);
	idp.codes.set(`code-${sub}`, { sub, nonce: authorize.searchParams.get('nonce') });
	const callback = await auth.handler(
		new Request(
			`https://frontend.test/api/auth/callback/oidc?code=code-${sub}&state=${authorize.searchParams.get('state')}`,
			{ headers: cookieHeaders(jar) }
		)
	);
	applySetCookies(jar, callback.headers);
	return jar;
}
