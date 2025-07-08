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
	let chat_started = $state(false);

	interface BaseMessage {
		type: 'ai' | 'user' | 'tool';
		text: string;
	}

	interface ToolMessage extends BaseMessage {
		type: 'tool';
		tool_name: string;
		payload?: any;
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
									console.debug('Got text');
									yield { type: 'text', text: fragment.text };
									break;
								case 'tool_use':
									console.debug('Got tool');
									yield { type: 'tool', tool_name: fragment.name, tool_payload: fragment.input };
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
						collapsed: true,
					};
					messages.push(toolMsg);
					messages = [...messages]; // Force reactivity
				} else if (chunk.type === 'text') {
					console.log('Adding text chunk:', chunk.text);
					aimessage.text += chunk.text;
					console.log('Updated aimessage.text:', aimessage.text);
					
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

<style>
	@keyframes bubble-dance {
		0%, 100% { transform: translateY(0px) scale(1); }
		25% { transform: translateY(-4px) scale(1.05); }
		50% { transform: translateY(-2px) scale(0.95); }
		75% { transform: translateY(-6px) scale(1.02); }
	}

	.bubble-dance {
		animation: bubble-dance 1.5s ease-in-out infinite;
	}

	@keyframes pulse-subtle {
		0%, 100% { box-shadow: 0 0 0 rgba(0, 0, 0, 0.1); }
		50% { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); }
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

{#if !chat_started}
	<!-- Greeting Page - Custom centered layout -->
	<div class="min-h-screen flex flex-col items-center justify-center px-4">
		<div class="w-full max-w-4xl mx-auto">
			<div class="min-h-[70vh] flex flex-col items-center justify-center text-center">
				<div class="max-w-2xl mx-auto space-y-8 fade-slide-up">
					<div class="space-y-4">
						<h1 class="text-4xl md:text-5xl font-light text-gray-900 dark:text-white">
							{#if page.data.session?.user?.name}
								Hey {page.data.session.user.name}, how can I help you today?
							{:else if page.data.session?.user?.email}
								Hey {page.data.session.user.email.split('@')[0]}, how can I help you today?
							{:else}
								How can I help you today?
							{/if}
						</h1>
						<p class="text-lg text-gray-600 dark:text-gray-400 font-light">
							I'm here to assist with your questions, provide information, help with tasks, or engage in conversation.
						</p>
					</div>
					
					<!-- Suggestion Cards -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12">
						<button 
							class="p-6 text-left border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all duration-200 bg-white dark:bg-gray-800"
							onclick={() => current_input = "Help me brainstorm ideas for a creative project"}
						>
							<h3 class="font-medium text-gray-900 dark:text-white mb-2">Creative Brainstorming</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">Generate ideas for projects, writing, or problem-solving</p>
						</button>
						
						<button 
							class="p-6 text-left border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all duration-200 bg-white dark:bg-gray-800"
							onclick={() => current_input = "Help me write and improve some text"}
						>
							<h3 class="font-medium text-gray-900 dark:text-white mb-2">Writing Assistance</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">Draft, edit, or improve emails, documents, and more</p>
						</button>
						
						<button 
							class="p-6 text-left border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all duration-200 bg-white dark:bg-gray-800"
							onclick={() => current_input = "Explain a complex topic in simple terms"}
						>
							<h3 class="font-medium text-gray-900 dark:text-white mb-2">Learn Something New</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">Get clear explanations on topics you're curious about</p>
						</button>
						
						<button 
							class="p-6 text-left border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all duration-200 bg-white dark:bg-gray-800"
							onclick={() => current_input = "Help me analyze and solve a problem"}
						>
							<h3 class="font-medium text-gray-900 dark:text-white mb-2">Problem Solving</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">Break down challenges and find solutions together</p>
						</button>
					</div>
				</div>
			</div>
			
			<!-- Centered Input for Greeting Page -->
			<div class="max-w-2xl mx-auto px-4 pb-8">
				<form id="input_form" onsubmit={inputSubmit}>
					<Textarea
						id="user-input"
						disabled={is_streaming}
						placeholder="Message..."
						rows={2}
						name="message"
						bind:value={current_input}
						clearable
						class="focus:ring-1 focus:ring-gray-300 focus:border-gray-300 transition-all duration-200 border-gray-300 dark:border-gray-600"
						onkeypress={(event) => {
							if (event.key === 'Enter' && event.shiftKey === false) inputSubmit();
						}}
					>
						{#snippet footer()}
							<div class="flex items-center justify-end">
								<Button 
									type="submit" 
									disabled={is_streaming}
									class="bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900 text-white border-0 shadow-sm transition-all duration-200"
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
{:else}
	<!-- Chat Interface - Custom layout without Section/Content constraints -->
	<div class="h-screen flex flex-col">
		<!-- Chat Messages Area - Scrollable -->
		<div class="flex-1 overflow-y-auto pb-32">
			<div class="w-full max-w-4xl mx-auto px-4 py-8">
				{#each messages as message, index}
					{#if !(index === 0 && message.text === 'How can I help you?')}
						{#if message.type === 'tool'}
							<!-- Tool Message -->
							<div class="mb-2 flex justify-start" use:scrollToMe>
								<div class="flex items-start gap-3 w-full max-w-[80%]">
									<div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-500 dark:bg-gray-400 flex items-center justify-center">
										<span class="text-white dark:text-gray-900 text-xs">🛠️</span>
									</div>
									<div class="relative">
										<div
											class="cursor-pointer inline-flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
											onclick={() => message.collapsed = !message.collapsed}
										>
											<span class="text-gray-600 dark:text-gray-400">{message.text}</span>
											<span class="text-xs font-mono text-gray-500 dark:text-gray-400">{message.tool_name}</span>
											<svg
												class="w-3 h-3 transition-transform duration-200"
												style="transform: {message.collapsed ? 'rotate(-90deg)' : ''};"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
											</svg>
										</div>
										{#if !message.collapsed}
											<div class="mt-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
												<div class="text-gray-600 dark:text-gray-400 mb-1">
													<span class="font-medium">Tool:</span> {message.tool_name}
												</div>
												{#if message.payload}
													<pre class="mt-1 overflow-x-auto bg-gray-100 dark:bg-gray-700 p-2 rounded text-xs text-gray-700 dark:text-gray-300">{JSON.stringify(message.payload, null, 2)}</pre>
												{/if}
											</div>
										{/if}
									</div>
								</div>
							</div>
						{:else}
							<!-- User/AI Message -->
							<div class="mb-6 w-full {message.type === 'user' ? 'flex justify-end' : 'flex justify-start'}" use:scrollToMe>
								<div class="flex items-start gap-3 {message.type === 'user' ? 'max-w-[70%] flex-row-reverse' : 'max-w-[80%] flex-row'}">
									<div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-600 dark:bg-gray-400 flex items-center justify-center">
										<UserOutline size="sm" class="text-white dark:text-gray-900" />
									</div>
									<div class="relative w-full">
										{#if message.type === 'ai' && is_streaming && index === messages.length - 1}
											<div class="absolute -top-3 left-4 flex gap-1">
												<div class="w-2 h-2 bg-gray-500 rounded-full bubble-dance" style="animation-delay: 0s"></div>
												<div class="w-2 h-2 bg-gray-500 rounded-full bubble-dance" style="animation-delay: 0.2s"></div>
												<div class="w-2 h-2 bg-gray-500 rounded-full bubble-dance" style="animation-delay: 0.4s"></div>
											</div>
										{/if}
										<Card class="p-4 text-sm shadow-sm {message.type === 'user' 
											? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-0 pulse-subtle' 
											: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}">
											<p class="whitespace-pre-wrap leading-relaxed">{message.text}</p>
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
		<div class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
			<div class="w-full max-w-4xl mx-auto px-4 py-4">
				<form id="input_form" onsubmit={inputSubmit}>
					<Textarea
						id="user-input"
						disabled={is_streaming}
						placeholder="Message..."
						rows={2}
						name="message"
						bind:value={current_input}
						clearable
						class="focus:ring-1 focus:ring-gray-300 focus:border-gray-300 transition-all duration-200 border-gray-300 dark:border-gray-600"
						onkeypress={(event) => {
							if (event.key === 'Enter' && event.shiftKey === false) inputSubmit();
						}}
					>
						{#snippet footer()}
							<div class="flex items-center justify-end">
								<Button 
									type="submit" 
									disabled={is_streaming}
									class="bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900 text-white border-0 shadow-sm transition-all duration-200"
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
