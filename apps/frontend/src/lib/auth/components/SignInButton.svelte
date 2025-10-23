<script>
	import { SignIn } from '@auth/sveltekit/components';
	import { Button } from 'flowbite-svelte';
	import { m } from '$lib/paraglide/messages.js';
</script>

<SignIn provider="oidc">
	<Button slot="submitButton" size="sm" tag="span">{m.auth_sign_in()}</Button>
</SignIn>
