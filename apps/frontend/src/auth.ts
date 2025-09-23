import { SvelteKitAuth } from '@auth/sveltekit';
import Descope from '@auth/sveltekit/providers/descope';
import { env } from '$env/dynamic/private';

// Add accessToken to Session type.
// Ref: https://authjs.dev/getting-started/typescript#module-augmentation
declare module '@auth/sveltekit' {
	interface Session {
		accessToken: string;
	}
}

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [
		Descope({
			clientId: env.AUTH_DESCOPE_ID,
			clientSecret: env.AUTH_DESCOPE_SECRET,
			...(env.AUTH_DESCOPE_ISSUER ? { issuer: env.AUTH_DESCOPE_ISSUER } : {})
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
		// Ref: https://docs.descope.com/getting-started/nextauth/functions
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

					const clientId = env.AUTH_DESCOPE_ID;
					const clientSecret = env.AUTH_DESCOPE_SECRET;

					// Must check for required env vars to avoid type error at URLSearchParams.
					if (!clientId || !clientSecret) {
						throw new Error('Missing Descope client credentials');
					}

					try {
						if (typeof token.refresh_token !== 'string')
							throw new Error('Token has no refresh token.');

						const response = await fetch('https://api.descope.com/oauth2/v1/token', {
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
