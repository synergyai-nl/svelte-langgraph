<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SignIn } from '@auth/sveltekit/components';
	import { Button, Modal, Textarea, Card, Spinner } from 'flowbite-svelte';
	import { ExclamationCircleOutline, UserOutline } from 'flowbite-svelte-icons';
	import { onMount } from 'svelte';
	import { Client } from '@langchain/langgraph-sdk';
	import type { MessageContentComplex } from '@langchain/core/messages';
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
	let chat_started = $state(false);

	interface BaseMessage {
		type: 'ai' | 'user' | 'tool';
		text: string;
	}

	interface ToolMessage extends BaseMessage {
		type: 'tool';
		tool_name: string;
		payload?: Record<string, unknown>;
		collapsed?: boolean; // For UI
	}

	type Message = BaseMessage | ToolMessage;

	let messages = $state<Array<Message>>([{ type: 'ai', text: 'How can I help you?' }]);

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

		if (input_messages.length === 0)
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
				case 'messages': {
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
								case 'text': {
									yield { type: 'text', text: fragment.text };
									break;
								}
								case 'tool_use': {
									yield { type: 'tool', tool_name: fragment.name, tool_payload: fragment.input };
									break;
								}
								case 'input_json_delta':
									break;
								default:
									console.log('Unexpected fragment type:', fragment.type);
							}
						}
					}

					break;
				}
				case 'error':
					console.error('Error:', chunk.data);
					break;
			}
		}
	}

	async function inputSubmit() {
		if (current_input) {
			chat_started = true;
			messages.push({
				type: 'user',
				text: current_input
			});

			is_streaming = true;

			let aimessage: Message = {
				type: 'ai',
				text: ''
			};

			messages.push(aimessage);

			for await (const chunk of streamAnswer(current_input)) {
				console.log('Processing chunk in inputSubmit:', chunk);
				if (chunk.type === 'tool') {
					const toolMsg: ToolMessage = {
						type: 'tool',
						text: "I'm using tools...",
						tool_name: chunk.tool_name,
						payload: chunk.tool_payload,
						collapsed: true
					};
					messages.push(toolMsg);

					// Create a new AI message after tool call
					aimessage = {
						type: 'ai',
						text: ''
					};
					messages.push(aimessage);
					messages = [...messages]; // Force reactivity
				} else if (chunk.type === 'text') {
					aimessage.text += chunk.text;

					// Find the AI message (skip any tool messages that might be at the end)
					let aiMessageIndex = -1;
					for (let i = messages.length - 1; i >= 0; i--) {
						if (messages[i].type === 'ai') {
							aiMessageIndex = i;
							break;
						}
					}

					if (aiMessageIndex !== -1) {
						// Update the AI message in place and force reactivity
						messages[aiMessageIndex] = { ...aimessage };
						messages = [...messages];
					}
				}
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

{#if !chat_started}
	<!-- Greeting Page -->
	<div class="flex min-h-screen flex-col items-center justify-start pt-16">
		<div class="mx-auto w-full max-w-4xl">
			<div class="flex flex-col items-center justify-center text-center">
				<div class="fade-slide-up mx-auto max-w-2xl space-y-8">
					<div class="space-y-4">
						<h1 class="text-4xl font-light text-gray-900 md:text-5xl dark:text-white">
							{#if page.data.session?.user?.name}
								Hey {page.data.session.user.name}, how can I help you today?
							{:else if page.data.session?.user?.email}
								Hey {page.data.session.user.email.split('@')[0]}, how can I help you today?
							{:else}
								How can I help you today?
							{/if}
						</h1>
						<p class="text-lg font-light text-gray-600 dark:text-gray-400">
							I'm here to assist with your questions, provide information, help with tasks, or
							engage in conversation.
						</p>
					</div>

					<!-- Suggestion Cards -->
					<div class="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
						<button
							class="rounded-xl border border-gray-200 bg-white p-6 text-left transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
							onclick={() => (current_input = 'Help me brainstorm ideas for a creative project')}
						>
							<h3 class="mb-2 font-medium text-gray-900 dark:text-white">Creative Brainstorming</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Generate ideas for projects, writing, or problem-solving
							</p>
						</button>

						<button
							class="rounded-xl border border-gray-200 bg-white p-6 text-left transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
							onclick={() => (current_input = 'Help me write and improve some text')}
						>
							<h3 class="mb-2 font-medium text-gray-900 dark:text-white">Writing Assistance</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Draft, edit, or improve emails, documents, and more
							</p>
						</button>

						<button
							class="rounded-xl border border-gray-200 bg-white p-6 text-left transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
							onclick={() => (current_input = 'Explain a complex topic in simple terms')}
						>
							<h3 class="mb-2 font-medium text-gray-900 dark:text-white">Learn Something New</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Get clear explanations on topics you're curious about
							</p>
						</button>

						<button
							class="rounded-xl border border-gray-200 bg-white p-6 text-left transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
							onclick={() => (current_input = 'Help me analyze and solve a problem')}
						>
							<h3 class="mb-2 font-medium text-gray-900 dark:text-white">Problem Solving</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Break down challenges and find solutions together
							</p>
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div
		class="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
	>
		<div class="mx-auto w-full max-w-4xl px-4 py-4">
			<form id="input_form" onsubmit={inputSubmit}>
				<Textarea
					id="user-input"
					disabled={is_streaming}
					placeholder="Message..."
					rows={2}
					name="message"
					bind:value={current_input}
					clearable
					class="border-gray-300 transition-all duration-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-600"
					onkeypress={(event) => {
						if (event.key === 'Enter' && event.shiftKey === false) inputSubmit();
					}}
				>
					{#snippet footer()}
						<div class="flex items-center justify-end">
							<Button
								type="submit"
								disabled={is_streaming}
								class="border-0 bg-gray-900 text-white shadow-sm transition-all duration-200 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
							>
								Send
								{#if is_streaming}
									<Spinner class="ms-2" size="4" color="white" />
								{/if}
							</Button>
						</div>
					{/snippet}
				</Textarea>
			</form>
		</div>
	</div>
{:else}
	<!-- Chat Interface -->
	<div class="flex h-screen flex-col">
		<!-- Chat Messages Area - Scrollable -->
		<div class="flex-1 overflow-y-auto pb-32">
			<div class="mx-auto w-full max-w-4xl px-4 py-8">
				{#each messages as message, index (index)}
					{#if !(index === 0 && message.text === 'How can I help you?')}
						{#if message.type === 'tool'}
							<!-- Tool Message -->
							<div class="mb-2 flex justify-start" use:scrollToMe>
								<div class="flex w-full max-w-[80%] items-start gap-3">
									<div
										class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 dark:bg-gray-400"
									>
										<span class="text-xs text-white dark:text-gray-900">🛠️</span>
									</div>
									<div class="relative">
										<div
											class="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
											onclick={() => (message.collapsed = !message.collapsed)}
										>
											<span class="text-gray-600 dark:text-gray-400">{message.text}</span>
											<span class="font-mono text-xs text-gray-500 dark:text-gray-400"
												>{message.tool_name}</span
											>
											<svg
												class="h-3 w-3 transition-transform duration-200"
												style="transform: {message.collapsed ? 'rotate(-90deg)' : ''};"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
													clip-rule="evenodd"
												/>
											</svg>
										</div>
										{#if !message.collapsed}
											<div
												class="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800"
											>
												<div class="mb-1 text-gray-600 dark:text-gray-400">
													<span class="font-medium">Tool:</span>
													{message.tool_name}
												</div>
												{#if message.payload && Object.keys(message.payload).length > 0}
													<div class="mt-1 text-gray-700 dark:text-gray-300">
														<span class="font-medium">Parameters:</span>
														<pre
															class="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-700">{JSON.stringify(
																message.payload,
																null,
																2
															)}</pre>
													</div>
												{:else}
													<div class="mt-1 text-gray-500 italic dark:text-gray-400">
														No parameters
													</div>
												{/if}
											</div>
										{/if}
									</div>
								</div>
							</div>
						{:else}
							<!-- User/AI Message -->
							<div
								class="mb-6 w-full {message.type === 'user'
									? 'flex justify-end'
									: 'flex justify-start'}"
								use:scrollToMe
							>
								<div
									class="flex items-start gap-3 {message.type === 'user'
										? 'max-w-[70%] flex-row-reverse'
										: 'max-w-[80%]'}"
								>
									<div
										class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 dark:bg-gray-400"
									>
										<UserOutline size="sm" class="text-white dark:text-gray-900" />
									</div>
									<div class="relative w-full">
										{#if message.type === 'ai' && is_streaming && index === messages.length - 1}
											<div class="absolute -top-3 left-4 flex gap-1">
												<div
													class="bubble-dance h-2 w-2 rounded-full bg-gray-500"
													style="animation-delay: 0s"
												></div>
												<div
													class="bubble-dance h-2 w-2 rounded-full bg-gray-500"
													style="animation-delay: 0.2s"
												></div>
												<div
													class="bubble-dance h-2 w-2 rounded-full bg-gray-500"
													style="animation-delay: 0.4s"
												></div>
											</div>
										{/if}
										<Card
											class="w-full max-w-none p-4 text-sm shadow-sm {message.type === 'user'
												? 'pulse-subtle border-0 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
												: 'border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}"
										>
											<p class="leading-relaxed whitespace-pre-wrap">{message.text}</p>
										</Card>
									</div>
								</div>
							</div>
						{/if}
					{/if}
				{/each}
			</div>
		</div>

		<!-- Fixed Bottom Input -->
		<div
			class="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
		>
			<div class="mx-auto w-full max-w-4xl px-4 py-4">
				<form id="input_form" onsubmit={inputSubmit}>
					<Textarea
						id="user-input"
						disabled={is_streaming}
						placeholder="Message..."
						rows={2}
						name="message"
						bind:value={current_input}
						clearable
						class="border-gray-300 transition-all duration-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-600"
						onkeypress={(event) => {
							if (event.key === 'Enter' && event.shiftKey === false) inputSubmit();
						}}
					>
						{#snippet footer()}
							<div class="flex items-center justify-end">
								<Button
									type="submit"
									disabled={is_streaming}
									class="border-0 bg-gray-900 text-white shadow-sm transition-all duration-200 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
								>
									Send
									{#if is_streaming}
										<Spinner class="ms-2" size="4" color="white" />
									{/if}
								</Button>
							</div>
						{/snippet}
					</Textarea>
				</form>
			</div>
		</div>
	</div>
{/if}

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

<style>
	@keyframes bubble-dance {
		0%,
		100% {
			transform: translateY(0px) scale(1);
		}
		25% {
			transform: translateY(-4px) scale(1.05);
		}
		50% {
			transform: translateY(-2px) scale(0.95);
		}
		75% {
			transform: translateY(-6px) scale(1.02);
		}
	}

	.bubble-dance {
		animation: bubble-dance 1.5s ease-in-out infinite;
	}

	@keyframes pulse-subtle {
		0%,
		100% {
			box-shadow: 0 0 0 rgba(0, 0, 0, 0.1);
		}
		50% {
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		}
	}

	.pulse-subtle {
		animation: pulse-subtle 2s ease-in-out infinite;
	}

	@keyframes fade-slide-up {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.fade-slide-up {
		animation: fade-slide-up 0.6s ease-out;
	}
</style>
