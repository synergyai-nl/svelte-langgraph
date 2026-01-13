<script>
	import { SignIn } from '@auth/sveltekit/components';
	import { buttonVariants } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
</script>

<SignIn provider="oidc">
	<span slot="submitButton" class={buttonVariants({ variant: 'default', size: 'sm' })}>
		{m.auth_sign_in()}
	</span>
</SignIn>
