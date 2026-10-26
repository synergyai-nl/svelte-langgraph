/**
 * OIDC provider for local development and the E2E suite, built on oauth2-mock-server.
 *
 * On top of the library it adds what the app relies on: a subject picker in front of authorize,
 * S256 PKCE, single-use codes, rotating refresh tokens that return no id_token (as many real
 * providers do), and RS256 JWT access tokens for the API audience (AUTH_OIDC_AUDIENCE).
 * Any client id and secret are accepted, as are any redirect URIs.
 *
 * Run with `node mocks/oidc.ts` (moon: `e2e:oidc-mock`, or `e2e:oidc-mock-e2e` for the E2E env).
 */
import { createServer, type IncomingMessage } from 'node:http';
import {
	OAuth2Server,
	type MutableRedirectUri,
	type MutableResponse,
	type MutableToken,
	type TokenRequest,
	type TokenRequestIncomingMessage
} from 'oauth2-mock-server';

const ISSUER = 'http://localhost:8080';
const AUDIENCE = process.env.AUTH_OIDC_AUDIENCE || 'svelte-langgraph-api';
/** `other-user` lets the E2E suite prove that one user cannot act on another's runs. */
const SUBJECTS = ['test-user', 'other-user'];

type Grant = { sub: string; scope: string };

/** Everything the provider remembers; kept in one place so test controls can adjust it. */
const state = {
	/** Access token (and id_token) lifetime in seconds. */
	lifetime: 3600,
	/** Authorization code -> the grant it was issued for; each code is used once. */
	codes: new Map<string, Grant>(),
	/** Refresh token -> the grant it continues; each refresh replaces it with a new token. */
	refreshTokens: new Map<string, Grant>()
};

const idp = new OAuth2Server(undefined, undefined, {
	// The library's own authorize endpoint redirects straight back; the picker sits in front.
	endpoints: { authorize: '/oauth2/consent', token: '/oauth2/token', userinfo: '/oauth2/userinfo' }
});

type TokenBody = TokenRequest & { refresh_token?: string };

const grantOf = (body: TokenBody) =>
	body.grant_type === 'authorization_code'
		? state.codes.get(body.code ?? '')
		: state.refreshTokens.get(body.refresh_token ?? '');

const html = (value: string) => value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

idp.service.addRoute('GET', '/oauth2/authorize', (req, res) => {
	const query = Object.entries(req.query).map(([name, value]) => [name, String(value)]);
	const hidden = query
		.map(([name, value]) => `<input type="hidden" name="${html(name)}" value="${html(value)}">`)
		.join('');
	const buttons = SUBJECTS.map((sub) => `<button name="sub" value="${sub}">${sub}</button>`);
	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	res.end(
		`<!doctype html><title>OIDC mock</title><h1>Sign in as</h1>` +
			`<form action="/oauth2/consent">${hidden}${buttons.join(' ')}</form>`
	);
});

idp.service.on('beforeAuthorizeRedirect', ({ url }: MutableRedirectUri, req: IncomingMessage) => {
	const query = new URL(req.url ?? '/', ISSUER).searchParams;
	const code = url.searchParams.get('code');
	const sub = query.get('sub') ?? '';
	const pkce = query.get('code_challenge') && query.get('code_challenge_method') === 'S256';
	if (code && pkce && SUBJECTS.includes(sub)) {
		state.codes.set(code, { sub, scope: query.get('scope') ?? 'openid' });
	} else {
		url.searchParams.delete('code');
		url.searchParams.set('error', 'invalid_request');
		url.searchParams.set('error_description', 'S256 PKCE and a known subject are required');
	}
});

idp.service.on('beforeTokenSigning', (token: MutableToken, req: TokenRequestIncomingMessage) => {
	const grant = grantOf(req.body);
	if (!grant) return; // Rejected in beforeResponse.
	token.payload.sub = grant.sub;
	token.payload.exp = token.payload.iat + state.lifetime;
	// The library gives the access token a `scope`; the id_token (aud = client id, nonce) has none.
	if ('scope' in token.payload) {
		Object.assign(token.payload, { aud: AUDIENCE, scope: grant.scope, jti: crypto.randomUUID() });
	}
});

idp.service.on('beforeResponse', (response: MutableResponse, req: TokenRequestIncomingMessage) => {
	const body: TokenBody = req.body;
	const grant = grantOf(body);
	state.codes.delete(body.code ?? '');
	state.refreshTokens.delete(body.refresh_token ?? '');
	// The library checks a code_verifier only when one is sent.
	const verified = body.grant_type !== 'authorization_code' || body.code_verifier !== undefined;
	if (!grant || !verified || typeof response.body !== 'object') {
		Object.assign(response, { statusCode: 400, body: { error: 'invalid_grant' } });
		return;
	}
	if (body.grant_type === 'refresh_token') delete response.body.id_token;
	Object.assign(response.body, { scope: grant.scope, expires_in: state.lifetime });
	state.refreshTokens.set(String(response.body.refresh_token), grant);
});

idp.service.on('beforeUserinfo', (response: MutableResponse, req: IncomingMessage) => {
	// Only this provider's own access tokens reach here, so the subject is read without verifying.
	const jwt = req.headers.authorization?.match(/^Bearer [^.]+\.([^.]+)\./)?.[1];
	const sub = jwt && JSON.parse(Buffer.from(jwt, 'base64url').toString()).sub;
	if (sub) response.body = { sub, email: `${sub}@example.test`, name: sub };
	else Object.assign(response, { statusCode: 401, body: { error: 'invalid_token' } });
});

idp.service.on('beforeWellKnownOpenIdConfiguration', (response: MutableResponse) => {
	Object.assign(response.body, {
		authorization_endpoint: `${ISSUER}/oauth2/authorize`,
		token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256']
	});
});

async function main() {
	await idp.issuer.keys.generate('RS256');
	idp.issuer.url = ISSUER;
	// `localhost` resolves to 127.0.0.1 or ::1 depending on the client, so serve both loopbacks.
	await idp.start(8080, '127.0.0.1');
	createServer(idp.service.requestHandler)
		.listen(8080, '::1')
		.on('error', (error) => console.warn(`Not serving on [::1]: ${error.message}`));
	console.log(`OIDC mock listening on ${ISSUER} (audience ${AUDIENCE})`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
