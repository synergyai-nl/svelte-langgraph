<script lang="ts">
	import { authClient } from '$lib/auth/client';
	import { buttonVariants, type ButtonVariant } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		label?: string;
		size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';
		variant?: ButtonVariant;
	}

	let { label = m.auth_sign_in(), size = 'sm', variant = 'default' }: Props = $props();
	let busy = $state(false);
	let failed = $state(false);
	async function signIn() {
		busy = true;
		failed = false;
		try {
			const result = await authClient.signIn.social({
				provider: 'oidc',
				callbackURL: `${location.pathname}${location.search}${location.hash}`
			});
			failed = Boolean(result.error);
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<button type="button" class={buttonVariants({ variant, size })} disabled={busy} onclick={signIn}>
	{label}
</button>
{#if failed}<p role="alert">{m.auth_unavailable()}</p>{/if}
