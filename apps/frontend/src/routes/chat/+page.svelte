<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SignIn } from '@auth/sveltekit/components';
	import { Button, Modal, P, Textarea, Card, Spinner } from 'flowbite-svelte';
	import { ExclamationCircleOutline, UserOutline } from 'flowbite-svelte-icons';
	import { onMount } from 'svelte';
	import { Content, Section } from 'flowbite-svelte-blocks';
	import { Client, type AIMessage } from '@langchain/langgraph-sdk';
	import { AssistantsClient } from '@langchain/langgraph-sdk/client';
	import type { MessageContentComplex, MessageContentText } from '@langchain/core/messages';
	import { PUBLIC_LANGCHAIN_API_KEY, PUBLIC_LANGGRAPH_API_URL } from '$env/static/public';

	const client = new Client({
		// Observe that this is insecure
		// We need to find a way to pass Descope's auth token which we can verify on the
		// the langgraph side.
		apiKey: PUBLIC_LANGCHAIN_API_KEY,
		apiUrl: PUBLIC_LANGGRAPH_API_URL
	});

	let show_login_dialog = $state(false);
	let current_input = $state('');
	let is_streaming = $state(false);

	interface Messsage {
		type: 'ai' | 'user';
		text: string;
	}

	let messages = $state<Array<Messsage>>([{ type: 'ai', text: 'How can I help you?' }]);

	let assistantId = $state('');
	let threadId = $state('');

	onMount(async () => {
		if (!page.data.session) show_login_dialog = true;

		const thread = await client.threads.create();
		threadId = thread.thread_id;
		const assistant = await client.assistants.create({
			graphId: 'chat' // process.env.LANGGRAPH_GRAPH_ID as string
		});
		assistantId = assistant.assistant_id;
	});

	async function* streamAnswer(input: string) {
		let input_messages = [];

		if ((input_messages.length = 0))
			input_messages.push({ role: 'ai', content: 'How may I help you?' });
		input_messages.push({ role: 'user', content: input });

		const streamResponse = client.runs.stream(threadId, assistantId, {
			input: {
				messages: input_messages
			},
			streamMode: 'messages-tuple'
		});

		for await (const chunk of streamResponse) {
			console.debug('Got chunk:', chunk);

			switch (chunk.event) {
				case 'messages':
					// Check if chunk.data[0] is defined and has content
					if (!chunk.data || !chunk.data[0]) {
						console.error('Invalid chunk data:', chunk);
						continue; // Skip this iteration if data is invalid
					}

					// Extract the message content
					const content = chunk.data[0].content as MessageContentComplex[];
					if (content) {
						for (let fragment of content) {
							switch (fragment.type) {
								case 'text':
									yield fragment.text;
									break;
								case 'tool_use':
									yield `\nCalling tool:${fragment.name}\n`;
									break;
								case 'input_json_delta':
									break;
								default:
									console.log('Unexpected fragment type:', fragment.type);
							}
						}
					}

					break;
				case 'error':
					console.error('Error:', chunk.data);
					break;
			}
		}
	}

	async function inputSubmit() {
		if (current_input) {
			messages.push({
				type: 'user',
				text: current_input
			});

			is_streaming = true;

			let aimessage: Messsage = {
				type: 'ai',
				text: ''
			};

			messages.push(aimessage);

			for await (const chunk of streamAnswer(current_input)) {
				aimessage.text += chunk;

				// Aparently changing by reference doesn't work.
				// So: kick this reactive locomotive.
				messages[messages.length - 1] = aimessage;
			}

			current_input = '';
			is_streaming = false;
		}
	}
	function scrollToMe(node) {
		node.scrollIntoView({ behavior: 'smooth', block: 'center' });

		return {
			destroy() {
				// Cleanup if needed
			}
		};
	}
</script>

<Section name="content">
	<Content>
		{#snippet h2()}Welcome to the chat{/snippet}

		{#each messages as message}
			<div class="flex items-center gap-4 py-4" use:scrollToMe>
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

		{#if is_streaming}
			<div class="text-center"><Spinner /></div>
		{/if}

		<form id="input_form" class="py-8" onsubmit={inputSubmit}>
			<Textarea
				id="user-input"
				disabled={is_streaming}
				placeholder="Your message"
				rows={2}
				name="message"
				bind:value={current_input}
				clearable
				onkeypress={(event) => {
					if (event.key === 'Enter' && event.shiftKey === false) inputSubmit();
				}}
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
