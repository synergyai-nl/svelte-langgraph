import type { Account, Session } from '@auth/sveltekit';
import type { JWT } from '@auth/core/jwt';
import { providerConfig } from './config';

export async function sessionCallback({ session, token }: { session: Session; token: JWT }) {
	if ('id_token' in token) {
		return { ...session, accessToken: token.id_token };
	}
	return session;
}

export async function JWTCallback({ token, account }: { token: JWT; account?: Account | null }) {
	if (account) {
		console.info('Initial login');

		if (account.expires_in === undefined) throw Error('Account has no expiration set.');

		return {
			...token,
			id_token: account.id_token,
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

			try {
				if (typeof token.refresh_token !== 'string') throw new Error('Token has no refresh token.');

				const discoveryResponse = await fetch(
					`${providerConfig.issuer}/.well-known/openid-configuration`
				);
				const discoveryData = await discoveryResponse.json();
				const tokenEndpoint = discoveryData.token_endpoint;

				const response = await fetch(tokenEndpoint, {
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						client_id: providerConfig.clientId,
						client_secret: providerConfig.clientSecret,
						grant_type: 'refresh_token',
						refresh_token: token.refresh_token
					}),
					method: 'POST'
				});

				const tokens = await response.json();

				if (!response.ok) throw tokens;

				return {
					...token,
					id_token: tokens.id_token,
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
