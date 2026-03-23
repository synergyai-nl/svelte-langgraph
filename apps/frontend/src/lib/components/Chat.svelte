<script lang="ts">
	import { untrack } from 'svelte';
	import { useStream } from '@langchain/svelte';
	import type { Client, Thread } from '@langchain/langgraph-sdk';
	import type { ThreadValues } from '$lib/langgraph/types';
	import ChatInput from './ChatInput.svelte';
	import ChatMessages from './ChatMessages.svelte';
	import ChatSuggestions, { type ChatSuggestion } from './ChatSuggestions.svelte';

	interface Props {
		langGraphClient: Client;
		assistantId: string;
		thread: Thread<ThreadValues>;
		suggestions?: ChatSuggestion[];
		intro?: string;
		introTitle?: string;
	}

	let {
		langGraphClient,
		assistantId,
		thread,
		suggestions = [],
		intro = '',
		introTitle = ''
	}: Props = $props();

	let current_input = $state('');

	// untrack: useStream is initialized once per component instance.
	// Chat remounts when thread changes (route-level navigation), so capturing
	// initial values here is intentional.
	//
	// initialValues pre-populates messages from the already-fetched thread state.
	// useStream doesn't fetch history on mount, so we seed it with page-fetched data.
	// After the first stream completes, mutate() is called internally to load real
	// history for branching.
	const { messages, isLoading, error, submit, stop, getMessagesMetadata, switchThread } = useStream(
		{
			client: untrack(() => langGraphClient),
			assistantId: untrack(() => assistantId),
			fetchStateHistory: true,
			messagesKey: 'messages',
			initialValues: untrack(() => (thread.values as Record<string, unknown>) ?? {})
		}
	);

	// useStream v0.1.3 ignores options.threadId — the internal store is always
	// initialized as undefined. switchThread() is the only way to pre-set it so
	// submit() uses the existing thread instead of creating a new one.
	switchThread(untrack(() => thread.thread_id));

	let chat_started = $derived($messages.length > 0 || $isLoading);

	// Show the waiting indicator when loading but no AI message has arrived yet
	let final_answer_started = $derived(!$isLoading || $messages.some((m) => m.getType() === 'ai'));

	async function submitInput() {
		if (!current_input.trim()) return;
		const text = current_input;
		current_input = '';
		await submit({ messages: [{ type: 'human', content: text, id: crypto.randomUUID() }] });
	}

	async function handleEditMessage(messageId: string, newText: string) {
		const msg = $messages.find((m) => m.id === messageId);
		if (!msg) return;

		const metadata = getMessagesMetadata(msg);
		await submit(
			{ messages: [{ type: 'human', content: newText, id: crypto.randomUUID() }] },
			{ checkpoint: metadata?.firstSeenState?.parent_checkpoint }
		);
	}

	async function retryGeneration() {
		const lastHuman = [...$messages].reverse().find((m) => m.getType() === 'human');
		if (!lastHuman) return;

		const metadata = getMessagesMetadata(lastHuman);
		await submit(undefined, { checkpoint: metadata?.firstSeenState?.parent_checkpoint });
	}
</script>

<div class="flex h-[calc(100vh-4rem)] flex-col">
	<div class="flex-1 overflow-y-auto pb-24">
		{#if !chat_started}
			<ChatSuggestions
				{suggestions}
				{introTitle}
				{intro}
				onSuggestionClick={(suggestedText) => {
					current_input = suggestedText;
					submitInput();
				}}
			/>
		{:else}
			<ChatMessages
				messages={$messages}
				finalAnswerStarted={final_answer_started}
				generationError={$error instanceof Error ? $error : null}
				onRetryError={retryGeneration}
				onEditSave={handleEditMessage}
				isLoading={$isLoading}
			/>
		{/if}
	</div>
	<ChatInput
		bind:value={current_input}
		isStreaming={$isLoading}
		onSubmit={submitInput}
		onStop={() => stop()}
	/>
</div>
