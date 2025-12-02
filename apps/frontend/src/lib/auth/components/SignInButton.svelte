<script>
	import { SignIn } from '@auth/sveltekit/components';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
</script>

<SignIn provider="oidc">
	<Button variant="default" slot="submitButton" size="sm" tag="span">{m.auth_sign_in()}</Button>
</SignIn>
