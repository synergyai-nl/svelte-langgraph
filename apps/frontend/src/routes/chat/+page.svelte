<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SignIn } from '@auth/sveltekit/components';
	import { Button, Modal, P, Textarea, Card, Spinner } from 'flowbite-svelte';
	import { ExclamationCircleOutline, UserOutline } from 'flowbite-svelte-icons';
	import { onMount } from 'svelte';
	import { Content, Section } from 'flowbite-svelte-blocks';

	let show_login_dialog = $state(false);
	let current_input = $state('');
	let is_streaming = $state(false);

	interface Messsage {
		type: 'ai' | 'user';
		text: string;
	}

	let messages = $state<Array<Messsage>>([
		{ type: 'ai', text: 'Hello human' },
		{
			type: 'user',
			text: 'I feel fine'
		}
	]);

	onMount(() => {
		if (!page.data.session) show_login_dialog = true;
	});

	function inputSubmit() {
		if (current_input) {
			messages.push({
				type: 'user',
				text: current_input
			});
			current_input = '';
			is_streaming = true;
		}
	}
</script>

<Section name="content">
	<Content>
		{#snippet h2()}Welcome to the chat{/snippet}

		{#each messages as message}
			<div class="flex items-center gap-4 py-4">
				{#if message.type == 'user'}
					<UserOutline size="xl" />
				{/if}
				<Card class="max-w-full p-4 text-sm">
					<p>{message.text}</p>
				</Card>
				{#if message.type == 'ai'}
					<UserOutline size="xl" />
				{/if}
			</div>
		{/each}

		<form class="py-8" onsubmit={inputSubmit}>
			<Textarea
				id="user-input"
				disabled={is_streaming}
				placeholder="Your message"
				rows={2}
				name="message"
				bind:value={current_input}
			>
				{#snippet footer()}
					<div class="flex items-center justify-end">
						<Button type="submit" disabled={is_streaming}>
							Submit
							{#if is_streaming}
								<Spinner class="ms-2" size="4" color="blue" />
							{/if}
						</Button>
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
