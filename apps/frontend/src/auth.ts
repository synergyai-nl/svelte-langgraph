import { SvelteKitAuth } from '@auth/sveltekit';
import Descope from '@auth/sveltekit/providers/descope';

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [Descope]
});
