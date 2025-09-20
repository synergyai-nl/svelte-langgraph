<script lang="ts">
	import { goto } from '$app/navigation';
	import { SignIn } from '@auth/sveltekit/components';
	import { Button, Modal } from 'flowbite-svelte';
	import { ExclamationCircleOutline } from 'flowbite-svelte-icons';

	interface Props {
		open: boolean;
		onclose?: () => void;
	}

	let { open = $bindable(), onclose }: Props = $props();

	function handleClose() {
		onclose?.();
		goto('/');
	}
</script>

<Modal title="Login required" size="xs" bind:open onclose={handleClose}>
	<div class="text-center">
		<ExclamationCircleOutline class="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-200" />
		<h3 class="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
			Please sign in to continue.
		</h3>
		<SignIn provider="descope">
			<Button slot="submitButton" size="sm" tag="div">Sign in</Button>
		</SignIn>
	</div>
</Modal>
