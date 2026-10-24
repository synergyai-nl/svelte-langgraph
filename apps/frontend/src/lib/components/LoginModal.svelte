<script lang="ts">
	import { goto } from '$app/navigation';
	import { CircleAlert } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';
	import * as Dialog from '$lib/components/ui/dialog';

	interface Props {
		open: boolean;
		/** The session expired while signed in: explain that, and stay on the page when closed. */
		expired?: boolean;
		onclose?: () => void;
	}

	let { open = $bindable(), expired = false, onclose }: Props = $props();

	function handleOpenChange(open_state: boolean) {
		if (!open_state) {
			// Read first: `onclose` may clear the state `expired` derives from.
			const stay = expired;
			onclose?.();
			if (!stay) goto('/');
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content class="bg-card rounded-card-lg shadow-popover border">
		<Dialog.Header>
			<Dialog.Title class="text-center">
				{expired ? m.auth_session_expired_title() : m.login_modal_title()}
			</Dialog.Title>
		</Dialog.Header>

		<div class="text-center">
			<CircleAlert class="text-foreground mx-auto mb-4 h-12 w-12" />
			<h3 class="text-foreground-alt mb-5 text-sm font-normal">
				{expired ? m.auth_session_expired_message() : m.login_modal_message()}
			</h3>
		</div>

		<div class="flex justify-center">
			<SignInButton label={m.auth_continue_sso()} size="default" />
		</div>
	</Dialog.Content>
</Dialog.Root>
