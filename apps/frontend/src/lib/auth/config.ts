import { env } from '$env/dynamic/private';
import type { GenericOIDCUserConfig } from './types';

function getFromEnv(variable_name: string): string {
	const val = env[variable_name];

	if (!val) throw Error(`Required environment varible '${variable_name}' not defined.`);

	return val;
}

// Lazy evaluation: only read env vars when this function is called at runtime
export function getProviderConfig(): GenericOIDCUserConfig {
	return {
		clientId: getFromEnv('AUTH_OIDC_CLIENT_ID'),
		clientSecret: getFromEnv('AUTH_OIDC_CLIENT_SECRET'),
		issuer: getFromEnv('AUTH_OIDC_ISSUER')
	};
}
