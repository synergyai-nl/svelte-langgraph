<script lang="ts">
	/**
	 * `<ChatSurface>` — the assembled, ready-to-drop-in chat surface (SLG-133 PR 3).
	 *
	 * Thin composition only: `ThreadList` (optional) beside `Conversation`, with the
	 * intro/`Suggestions` empty state layered in via `Conversation`'s `children` render-prop. No
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
	import Conversation, {
		defaultConversationLabels,
		type ConversationLabels
	} from './Conversation.svelte';
	import { ThreadList } from './ThreadList';
	import Suggestions, { type ChatSuggestion } from './Suggestions.svelte';
	import MessagesList from './MessagesList.svelte';
	import Composer from './Composer.svelte';
	import StateField from './StateField.svelte';
	import { resolveLabels, type DeepPartial } from './labels.js';
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

	// Same computation `Conversation` performs internally on the same `labels` prop and the same
	// `ctx` — deterministically equal — needed here too because the empty-state `Suggestions`
	// branch below replaces `Conversation`'s own default composition via `children`.
	const l = $derived(resolveLabels(defaultConversationLabels, ctx?.labels, labels));
</script>

{#if sidebar}
	<ThreadList />
{/if}
<!-- `h-full min-h-0` in addition to `flex-1`: as a flex child (the `sidebar` case, beside
     `ThreadList` under `Sidebar.Provider`'s flex row) `flex-1` sizes the pane, but embedded in a
     plain block container (e.g. the chat layout's `min-h-0 flex-1` content div) `flex-1` is inert
     and only `h-full` bounds the pane — without it the message list grows instead of scrolling. -->
<div class="bg-background relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
	{#if resolvedThreadId}
		{#key resolvedThreadId}
			<Conversation threadId={resolvedThreadId} {labels}>
				{#snippet children(api)}
					<div class="flex h-full min-h-0 flex-col">
						<!-- Slim state-field bar — renders nothing when schema is unavailable (degraded mode) -->
						<div class="flex justify-end px-4 py-1">
							<StateField name="phase" field={api.sync.field('phase')} />
						</div>
						<div class="min-h-0 flex-1 overflow-y-auto pb-4" aria-busy={api.isThreadLoading}>
							{#if api.isThreadLoading}
								<div
									data-testid="chat-history-loading"
									class="mx-auto w-full max-w-4xl space-y-4 p-4"
								>
									<p class="sr-only" role="status" aria-live="polite">{l.historyLoading}</p>
									<div class="bg-muted h-16 w-3/4 animate-pulse rounded-lg"></div>
									<div class="bg-muted h-16 w-full animate-pulse rounded-lg"></div>
									<div class="bg-muted h-16 w-1/2 animate-pulse rounded-lg"></div>
								</div>
							{:else if !api.chatStarted}
								<Suggestions
									{suggestions}
									{introTitle}
									{intro}
									onSuggestionClick={(suggestedText) => api.submit(suggestedText)}
								/>
							{:else}
								<MessagesList
									messages={api.messages}
									finalAnswerStarted={api.finalAnswerStarted}
									isStreaming={api.isLoading}
									generationError={api.error}
									onRetryError={api.retry}
									onEdit={api.edit}
									onRegenerate={api.regenerate}
									labels={l.messagesList}
								/>
							{/if}
						</div>
						<Composer
							bind:value={() => api.input, (v) => api.setInput(v)}
							isStreaming={api.isLoading}
							onSubmit={() => api.submit(api.input)}
							onStop={api.stop}
							labels={l.composer}
						/>
					</div>
				{/snippet}
			</Conversation>
		{/key}
	{:else}
		<ChatLoader />
	{/if}
</div>
