<script lang="ts">
	/**
	 * `<ChatSurface>` — the assembled, ready-to-drop-in chat surface (SLG-133 PR 3).
	 *
	 * Thin composition only: `ThreadList` (optional) beside `Conversation`, with the
	 * intro/`Suggestions` empty state filled into `Conversation`'s `empty` render-prop. No
	 * business logic of its own — everything it renders is driven by `ConversationApi` and the
	 * ambient `<LangGraph>` context.
	 *
	 * Sidebar constraint: `Sidebar.Provider` (rendered by the ambient `<LangGraph>`) requires the
	 * sidebar and the main content pane to be its literal flex children — see `LangGraph.svelte`.
	 * `ChatSurface` renders no provider of its own, so when `sidebar` is set it renders
	 * `<ThreadList>` and the content pane as two top-level siblings in ITS OWN markup, with no
	 * wrapping element around them. Because a Svelte component's root-level markup is inlined at
	 * its usage site (no extra DOM node), this only actually satisfies the constraint when
	 * `<ChatSurface sidebar>` is itself a direct child of `<LangGraph>` (or of whatever renders
	 * `<Sidebar.Provider>`) — nesting it deeper reintroduces a wrapping element and breaks the
	 * layout. That is an inherent limit of composing this from inside one component; callers that
	 * need more nesting should assemble `ThreadList`/`Conversation` by hand instead.
	 */
	import ChatLoader from '../ChatLoader.svelte';
	import Conversation, { type ConversationLabels } from './Conversation.svelte';
	import { ThreadList } from './ThreadList';
	import Suggestions, { type ChatSuggestion } from './Suggestions.svelte';
	import { type DeepPartial } from './labels.js';
	import { useLangGraphOptional } from './langGraphContext.svelte.js';

	interface Props {
		/** Defaults to the ambient `<LangGraph>` context's active thread. */
		threadId?: string;
		/** Render a `ThreadList` beside the conversation pane. See the sidebar constraint above. */
		sidebar?: boolean;
		suggestions?: ChatSuggestion[];
		intro?: string;
		introTitle?: string;
		labels?: DeepPartial<ConversationLabels>;
	}

	let {
		threadId,
		sidebar = false,
		suggestions = [],
		intro = '',
		introTitle = '',
		labels
	}: Props = $props();

	const ctx = useLangGraphOptional();

	let resolvedThreadId = $derived(threadId ?? ctx?.activeThreadId ?? null);

	// `Conversation` resolves its client/assistant at init and throws when neither its props nor
	// the context can supply them (see its header comment: readiness gating is the caller's
	// job). ChatSurface is the ready-to-drop-in caller, so it holds `Conversation` back behind
	// the loader until the ambient provider has both. Without a provider at all this stays
	// `false` forever — ChatSurface is only usable inside `<LangGraph>`.
	const ready = $derived(Boolean(ctx?.client && ctx?.assistantId));
</script>

{#if sidebar}
	<ThreadList />
{/if}
<!-- `h-full min-h-0` in addition to `flex-1`: as a flex child (the `sidebar` case, beside
     `ThreadList` under `Sidebar.Provider`'s flex row) `flex-1` sizes the pane, but embedded in a
     plain block container (e.g. the chat layout's `min-h-0 flex-1` content div) `flex-1` is inert
     and only `h-full` bounds the pane — without it the message list grows instead of scrolling. -->
<div class="bg-background relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
	{#if resolvedThreadId && ready}
		<!-- The remount boundary covers everything `Conversation` captures at init: the thread,
		     the client identity, and the assistant id. A provider whose explicit `assistantId`
		     or client changes mid-thread must remount the conversation, or it keeps streaming
		     through the stale configuration. -->
		{#key resolvedThreadId}
			{#key ctx?.client}
				{#key ctx?.assistantId}
					<Conversation threadId={resolvedThreadId} {labels}>
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
