<script lang="ts">
	import { authClient } from '$lib/auth/client';
	import { m } from '$lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	interface Props {
		children: Snippet;
		onclick?: (event: MouseEvent) => void;
	}
	let { children, onclick }: Props = $props();
	let failed = $state(false);
	async function signOut(event: MouseEvent) {
		onclick?.(event);
		failed = false;
		try {
			const result = await authClient.signOut();
			if (result.error) failed = true;
			else location.assign('/');
		} catch {
			failed = true;
		}
	}
</script>

<button type="button" class="w-full text-left" onclick={signOut}>{@render children()}</button>
{#if failed}<p role="alert">{m.auth_unavailable()}</p>{/if}
