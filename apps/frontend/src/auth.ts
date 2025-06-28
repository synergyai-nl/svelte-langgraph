import { SvelteKitAuth } from '@auth/sveltekit';
import Descope from '@auth/sveltekit/providers/descope';

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [Descope],
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
