import { SvelteKitAuth } from '@auth/sveltekit';
import type { OIDCConfig } from '@auth/sveltekit/providers';
import { env } from '$env/dynamic/private';

declare module '@auth/sveltekit' {
	interface Session {
		accessToken: string;
	}
}

function GenericOIDC(config: {
	clientId: string;
	clientSecret: string;
	issuer: string;
}): OIDCConfig<Record<string, unknown>> {
	return {
		id: 'oidc',
		name: 'OIDC',
		type: 'oidc',
		checks: ['pkce', 'state'],
		client: {
			token_endpoint_auth_method: 'client_secret_post'
		},
		options: config
	};
}

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [
		GenericOIDC({
			clientId: env.AUTH_OIDC_CLIENT_ID || '',
			clientSecret: env.AUTH_OIDC_CLIENT_SECRET || '',
			issuer: env.AUTH_OIDC_ISSUER || ''
		})
	],
	trustHost: true,
	callbacks: {
		session: async ({ session, token }) => {
			if ('access_token' in token) {
				return { ...session, accessToken: token.access_token };
			}
			return session;
		},
		jwt: async ({ token, account }) => {
			if (account) {
				console.info('Initial login');

				if (account.expires_in === undefined) throw Error('Account has no expiration set.');

				return {
					...token,
					access_token: account.access_token,
					expires_at: Math.floor(Date.now() / 1000 + account.expires_in),
					refresh_token: account.refresh_token
				};
			} else {
				if (typeof token.expires_at !== 'number') throw Error('Token has no expiration set.');

				if (Date.now() < token.expires_at * 1000) {
					console.debug('Returning valid token');

					return token;
				} else {
					console.info('Token expired, renewing', Date.now(), token.expires_at * 1000);

					const clientId = env.AUTH_OIDC_CLIENT_ID;
					const clientSecret = env.AUTH_OIDC_CLIENT_SECRET;
					const issuer = env.AUTH_OIDC_ISSUER;

					if (!clientId || !clientSecret || !issuer) {
						throw new Error('Missing OIDC client credentials');
					}

					try {
						if (typeof token.refresh_token !== 'string')
							throw new Error('Token has no refresh token.');

						const tokenEndpoint = `${issuer}/token`;

						const response = await fetch(tokenEndpoint, {
							headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
							body: new URLSearchParams({
								client_id: clientId,
								client_secret: clientSecret,
								grant_type: 'refresh_token',
								refresh_token: token.refresh_token
							}),
							method: 'POST'
						});

						const tokens = await response.json();

						if (!response.ok) throw tokens;

						return {
							...token,
							access_token: tokens.access_token,
							expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
							refresh_token: tokens.refresh_token ?? token.refresh_token
						};
					} catch (error) {
						console.error('Error refreshing access token', error);
						return { ...token, error: 'RefreshAccessTokenError' };
					}
				}
			}
		}
	}
});
