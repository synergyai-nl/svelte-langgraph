import { SvelteKitAuth } from '@auth/sveltekit';
import { GenericOIDCProvider } from '$lib/auth/provider';
import { JWTCallback, sessionCallback } from './callbacks';
import { providerConfig } from './config';

declare module '@auth/sveltekit' {
	interface Session {
		accessToken: string;
	}
}

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [GenericOIDCProvider(providerConfig)],
	trustHost: true,
	callbacks: {
		session: sessionCallback,
		jwt: JWTCallback
	}
});
