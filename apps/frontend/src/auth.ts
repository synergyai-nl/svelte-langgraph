import { SvelteKitAuth } from '@auth/sveltekit';
import Descope from '@auth/sveltekit/providers/descope';

// Add accessToken to Session type.
// Ref: https://authjs.dev/getting-started/typescript#module-augmentation
declare module '@auth/sveltekit' {
	interface Session {
		accessToken: string;
	}
}

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [Descope],
	trustHost: true,
	callbacks: {
		session: async ({ session, token }) => {
			if ('accessToken' in token) {
				return { ...session, accessToken: token.accessToken };
			}
			return session;
		},
		jwt({ token, account }) {
			if (account) {
				// Add access token if provided.
				return { ...token, accessToken: account.access_token };
			}
			return token;
		}
	}
});
