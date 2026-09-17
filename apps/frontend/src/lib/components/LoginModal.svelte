<script lang="ts">
	import type { AuthFailure } from '$lib/langgraph/authenticatedFetch';
	import { Button } from '$lib/components/ui/button';
	import { CircleAlert } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';
	import * as Dialog from '$lib/components/ui/dialog';

	interface Props {
		open: boolean;
		onclose?: () => void;
		failure?: AuthFailure | null;
		onretry?: () => void;
		busy?: boolean;
	}

	let { open = $bindable(), onclose, failure, onretry, busy = false }: Props = $props();

	function handleOpenChange(open_state: boolean) {
		if (!open_state) {
			onclose?.();
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content class="bg-card rounded-card-lg shadow-popover border">
		<Dialog.Header>
			<Dialog.Title class="text-center">
				{failure ? m.auth_recovery_title() : m.login_modal_title()}
			</Dialog.Title>
		</Dialog.Header>

		<div class="text-center">
			<CircleAlert class="text-foreground mx-auto mb-4 h-12 w-12" />
			<h3 class="text-foreground-alt mb-5 text-sm font-normal">
				{failure === 'AUTH_UNAVAILABLE'
					? m.auth_unavailable()
					: failure === 'AUTH_REFRESH_FAILED'
						? m.auth_refresh_failed()
						: failure === 'AUTH_REQUIRED'
							? m.auth_required()
							: m.login_modal_message()}
			</h3>
		</div>

		<div class="flex justify-center gap-3">
			{#if onretry}<Button variant="outline" disabled={busy} onclick={onretry}
					>{m.auth_retry()}</Button
				>{/if}
			<SignInButton label={m.auth_continue_sso()} size="default" />
		</div>
	</Dialog.Content>
</Dialog.Root>
