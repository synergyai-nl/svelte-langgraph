<script lang="ts">
	import { SignIn } from '@auth/sveltekit/components';
	import { buttonVariants, type ButtonVariant } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		label?: string;
		size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';
		variant?: ButtonVariant;
	}

	let { label = m.auth_sign_in(), size = 'sm', variant = 'default' }: Props = $props();
</script>

<SignIn provider="oidc">
	<span slot="submitButton" class={buttonVariants({ variant, size })}>
		{label}
	</span>
</SignIn>
