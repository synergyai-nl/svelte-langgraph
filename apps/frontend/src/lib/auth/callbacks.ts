import type { Account, Session } from '@auth/sveltekit';
import type { JWT } from '@auth/core/jwt';
import { getProviderConfig } from './config';
import type { GenericOIDCUserConfig } from './types';

export async function sessionCallback({ session, token }: { session: Session; token: JWT }) {
	if ('id_token' in token) {
		return { ...session, accessToken: token.id_token };
	}
	return session;
}

function getExpiresAt(expires_in: number): number {
	return Math.floor(Date.now() / 1000 + expires_in);
}

let tokenEndpoint: string;
async function getTokenEndpoint(config: GenericOIDCUserConfig): Promise<string> {
	if (!tokenEndpoint) {
		const discoveryResponse = await fetch(`${config.issuer}/.well-known/openid-configuration`);
		const discoveryData = await discoveryResponse.json();
		tokenEndpoint = discoveryData.token_endpoint;

		if (typeof tokenEndpoint !== 'string')
			throw new Error('Invalid value returned for token endpoint.');
	}

	return tokenEndpoint;
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
	if (typeof token.refresh_token !== 'string') throw new Error('Token has no refresh token.');

	const config = getProviderConfig();
	const tokenEndpoint = await getTokenEndpoint(config);

	const response = await fetch(tokenEndpoint, {
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			grant_type: 'refresh_token',
			refresh_token: token.refresh_token
		}),
		method: 'POST'
	});

	const tokens = await response.json();

	if (!response.ok) throw new Error(`Request error updating token: ${tokens}`);

	return {
		...token,
		id_token: tokens.id_token,
		expires_at: getExpiresAt(tokens.expires_in),
		refresh_token: tokens.refresh_token ?? token.refresh_token
	};
}

export async function JWTCallback({ token, account }: { token: JWT; account?: Account | null }) {
	if (account) {
		console.info('Initial login');

		if (account.expires_in === undefined) throw Error('Account has no expiration set.');

		return {
			...token,
			id_token: account.id_token,
			expires_at: getExpiresAt(account.expires_in),
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
				return refreshAccessToken(token);
			} catch (error) {
				console.error('Error refreshing access token', error);
				return { ...token, error: 'RefreshAccessTokenError' };
			}
		}
	}
}
