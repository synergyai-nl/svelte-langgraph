<script>
	import { SignIn } from '@auth/sveltekit/components';
	import { m } from '$lib/paraglide/messages.js';
</script>

<SignIn provider="oidc">
	<span
		slot="submitButton"
		class="bg-primary-700 hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-700 focus-within:ring-primary-300 dark:focus-within:ring-primary-800 inline-flex cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-center text-sm font-medium text-white focus-within:ring-4 focus-within:outline-hidden"
	>
		{m.auth_sign_in()}
	</span>
</SignIn>
