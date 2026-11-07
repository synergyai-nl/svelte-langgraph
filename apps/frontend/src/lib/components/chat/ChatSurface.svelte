<script lang="ts">
	/**
	 * `<ChatSurface>` — the assembled, ready-to-drop-in chat surface (SLG-133 PR 3).
	 *
	 * The conversation pane: `Conversation` with the intro/`Suggestions` empty state filled into
	 * its `empty` render-prop. No business logic of its own — everything it renders is driven by
	 * `ConversationApi` and the ambient `<LangGraph>` context.
	 *
	 * It renders no `Sidebar.Provider` and no `ThreadList`. For a thread list, compose it yourself,
	 * as `routes/chat/+layout.svelte` does: a stock `<Sidebar.Provider class="h-full min-h-0">`
	 * holding `<ThreadList />` and a pane with your own `<Sidebar.Trigger />` and `<ChatSurface />`.
	 */
	import ChatLoader from '../ChatLoader.svelte';
	import Conversation from './Conversation.svelte';
	import Suggestions, { type ChatSuggestion } from './Suggestions.svelte';
	import { useLangGraph } from './langGraphContext.svelte.js';

	interface Props {
		/** Defaults to the ambient `<LangGraph>` context's active thread. */
		threadId?: string;
		suggestions?: ChatSuggestion[];
		intro?: string;
		introTitle?: string;
	}

	let { threadId, suggestions = [], intro = '', introTitle = '' }: Props = $props();

	const ctx = useLangGraph('ChatSurface');

	let resolvedThreadId = $derived(threadId ?? ctx.activeThreadId ?? null);

	// `Conversation` resolves its client/assistant at init and throws when neither its props nor
	// the context can supply them (see its header comment: readiness gating is the caller's
	// job). ChatSurface is the ready-to-drop-in caller, so it holds `Conversation` back behind
	// the loader until the ambient provider has both. Outside `<LangGraph>` it throws at init
	// (via `useLangGraph('ChatSurface')`), like `ThreadList` and `Conversation`.
	const ready = $derived(Boolean(ctx.client && ctx.assistantId));
</script>

<!-- `h-full min-h-0` in addition to `flex-1`: as a flex child (e.g. beside `ThreadList` under a
     `Sidebar.Provider`'s flex row) `flex-1` sizes the pane, but embedded in a plain block
     container (an embed's card, or the chat layout's `min-h-0 flex-1` content div) `flex-1` is
     inert and only `h-full` bounds the pane — without it the message list grows instead of
     scrolling. -->
<div class="bg-background relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
	{#if resolvedThreadId && ready}
		<!-- The remount boundary covers everything `Conversation` captures at init: the thread,
		     the client identity, and the assistant id. A provider whose explicit `assistantId`
		     or client changes mid-thread must remount the conversation, or it keeps streaming
		     through the stale configuration. -->
		{#key resolvedThreadId}
			{#key ctx.client}
				{#key ctx.assistantId}
					<Conversation threadId={resolvedThreadId}>
						{#snippet empty(api)}
							<Suggestions
								{suggestions}
								{introTitle}
								{intro}
								onSuggestionClick={(suggestedText) => api.submit(suggestedText)}
							/>
						{/snippet}
					</Conversation>
				{/key}
			{/key}
		{/key}
	{:else}
		<ChatLoader />
	{/if}
</div>
