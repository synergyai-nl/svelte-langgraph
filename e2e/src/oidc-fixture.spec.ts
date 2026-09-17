import { createHash, randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { OIDC_CONFIG } from './pages';

test('the mock binds an authorization code to its PKCE verifier', async ({ request }) => {
	const verifier = randomBytes(32).toString('base64url');
	const redirectUri = 'http://localhost:4173/api/auth/callback/oidc';
	const authorize = new URL('/oauth2/authorize', OIDC_CONFIG.issuer);
	authorize.search = new URLSearchParams({
		client_id: OIDC_CONFIG.clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'openid profile email',
		nonce: randomBytes(16).toString('hex'),
		code_challenge: createHash('sha256').update(verifier).digest('base64url'),
		code_challenge_method: 'S256'
	}).toString();
	const consent = await request.post(authorize.toString(), {
		form: { sub: OIDC_CONFIG.username },
		maxRedirects: 0
	});
	expect(consent.status()).toBe(302);
	const code = new URL(consent.headers().location).searchParams.get('code');
	expect(code).toBeTruthy();
	const exchange = {
		grant_type: 'authorization_code',
		client_id: OIDC_CONFIG.clientId,
		client_secret: OIDC_CONFIG.clientSecret,
		redirect_uri: redirectUri,
		code: code!
	};
	const invalidVerifiers: Record<string, string>[] = [
		{},
		{ code_verifier: randomBytes(32).toString('base64url') }
	];
	for (const extra of invalidVerifiers) {
		const rejected = await request.post(`${OIDC_CONFIG.issuer}/oauth2/token`, {
			form: { ...exchange, ...extra }
		});
		expect(rejected.status()).toBe(400);
	}
	const accepted = await request.post(`${OIDC_CONFIG.issuer}/oauth2/token`, {
		form: { ...exchange, code_verifier: verifier }
	});
	expect(accepted.ok()).toBe(true);
	const tokens = await accepted.json();
	const access = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString());
	const identity = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
	expect(access.aud).toBe('svelte-langgraph-api');
	expect(identity.aud).toContain(OIDC_CONFIG.clientId);
	expect(access.exp - access.iat).toBe(tokens.expires_in);
});
