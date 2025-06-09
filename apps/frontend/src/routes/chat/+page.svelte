<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SignIn } from '@auth/sveltekit/components';
	import { Button, Label, Modal, P, Textarea, Card } from 'flowbite-svelte';
	import { ExclamationCircleOutline, UserOutline } from 'flowbite-svelte-icons';
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

		<div class="flex items-center gap-4">
			<UserOutline size="xl" />
			<Card class="max-w-full p-4 text-sm">
				<p>
					Here are the biggest enterprise technology acquisitions of 2021 so far, in reverse
					chronological order.
				</p>
			</Card>
		</div>

		<div class="flex items-center gap-4 py-4">
			<Card class="max-w-full p-4 text-sm">
				<p>
					Here are the biggest enterprise technology acquisitions of 2021 so far, in reverse
					chronological order.
				</p>
			</Card>
			<UserOutline size="xl" />
		</div>

		<form class="py-8">
			<Label for="user-input" class="mb-2">Your message</Label>
			<Textarea id="user-input" placeholder="Your message" rows={2} name="message">
				{#snippet footer()}
					<div class="flex items-center justify-end">
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
