<script lang="ts">
	import { goto } from '$app/navigation';
	import { CircleAlert } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';
	import * as Dialog from '$lib/components/ui/dialog';

	interface Props {
		open: boolean;
		onclose?: () => void;
	}

	let { open = $bindable(), onclose }: Props = $props();

	function handleOpenChange(next: boolean) {
		if (!next) {
			onclose?.();
			goto('/');
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content class="bg-card rounded-card-lg shadow-popover border">
		<Dialog.Header>
			<Dialog.Title class="text-center">
				{m.login_modal_title()}
			</Dialog.Title>
		</Dialog.Header>

		<div class="text-center">
			<CircleAlert class="text-foreground mx-auto mb-4 h-12 w-12" />
			<h3 class="text-foreground-alt mb-5 text-sm font-normal">
				{m.login_modal_message()}
			</h3>
		</div>

		<div class="flex justify-center">
			<SignInButton />
		</div>
	</Dialog.Content>
</Dialog.Root>
