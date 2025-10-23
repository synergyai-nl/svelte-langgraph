import { SvelteKitAuth } from '@auth/sveltekit';
import { GenericOIDCProvider } from '$lib/auth/provider';
import { JWTCallback, sessionCallback } from './callbacks';
import { getProviderConfig } from './config';

declare module '@auth/sveltekit' {
	interface Session {
		accessToken: string;
	}
}

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [GenericOIDCProvider(getProviderConfig())],
	trustHost: true,
	callbacks: {
		session: sessionCallback,
		jwt: JWTCallback
	}
});
