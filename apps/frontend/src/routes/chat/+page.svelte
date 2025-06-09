<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SignIn } from '@auth/sveltekit/components';
	import { Button, Label, Modal, P, Textarea } from 'flowbite-svelte';
	import { ExclamationCircleOutline } from 'flowbite-svelte-icons';
	import { onMount } from 'svelte';
	import { Content, Section } from 'flowbite-svelte-blocks';

	let show_login_dialog = $state(false);

	onMount(() => {
		if (!page.data.session) show_login_dialog = true;
	});
</script>

<Section name="content">
	<Content>
		{#snippet h2()}Welcome to the chat{/snippet}

		<form>
			<Label for="textarea-id" class="mb-2">Your message</Label>
			<Textarea id="textarea-id" placeholder="Your message" rows={4} name="message">
				{#snippet footer()}
					<div class="flex items-center justify-between">
						<Button type="submit">Submit</Button>
					</div>
				{/snippet}
			</Textarea>
		</form>
	</Content>
</Section>

<!-- Smooth conditional login modal -->

<Modal
	title="Login required"
	size="xs"
	bind:open={show_login_dialog}
	onclose={() => {
		goto('/');
	}}
>
	<div class="text-center">
		<ExclamationCircleOutline class="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-200" />
		<h3 class="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
			Please sign in to continue.
		</h3>
		<SignIn provider="descope">
			<Button slot="submitButton" size="sm">Sign in</Button>
		</SignIn>
	</div>
</Modal>
