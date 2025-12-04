<script>
	import { SignIn } from '@auth/sveltekit/components';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
</script>

<SignIn provider="oidc">
	<Button asChild variant="default" slot="submitButton" size="sm">
		<span>{m.auth_sign_in()}</span>
	</Button>
</SignIn>
