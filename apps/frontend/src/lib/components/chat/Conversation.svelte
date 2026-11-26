<script lang="ts" module>
	import { getContext, setContext } from 'svelte';
	import type { Message, SchemaStatus, FieldBinding } from '#lib/svelte-langgraph-client/index.ts';

	/**
	 * The reactive surface `Conversation` hands to its `children` and `empty` snippets (and sets
	 * as `ConversationContext` for deep-tree consumers). Everything the component's own default
	 * composition reads is on here too — see the template below — so a caller replacing that
	 * composition wholesale via `children` has everything needed to build its own. A caller that
	 * only wants different empty-thread content (e.g. `ChatSurface`'s `Suggestions`) should pass
	 * `empty` instead of copying the default composition into `children`.
	 */
	export interface ConversationApi {
		/** Render-ready messages for the current thread. */
		messages: Message[];
		/** Current composer input text. */
		input: string;
		setInput: (value: string) => void;
		/** A run is actively streaming (submit/edit/regenerate in flight). */
		isLoading: boolean;
		/** The thread's history is still being fetched/reconnected. */
		isThreadLoading: boolean;
		/** `true` once the thread has any messages, is loading, or has a generation error. */
		chatStarted: boolean;
		/** `false` while the in-flight run's final AI answer hasn't started yet (still "thinking"). */
		finalAnswerStarted: boolean;
		/** Current (non-cancellation) generation error, if any. */
		error: Error | null;
		/**
		 * Start a run. With `text`, sends it as a new user message, whatever it is: guard blank input
		 * in the UI (`MessageComposer` does). No-op while `isLoading` or `isThreadLoading`. Clears
		 * `input`. When the send fails before the client learns of a run (e.g. a 401), the message
		 * leaves the list and the text goes back into `input`.
		 *
		 * Without `text`, starts a run with no human message (`{ messages: [] }`), for an agent that
		 * speaks first or a backend that answers the last human message again. No-op while
		 * `isLoading` or `isThreadLoading`. Adds no message and leaves `input` alone; a failure
		 * lands in `error`, as with text.
		 */
		submit: (text?: string) => void;
		/** Resubmit the last user message after a generation error. */
		retry: () => void;
		/** Stop the in-flight run. */
		stop: () => void;
		/** Branch-edit a past user message. Returns `false` when it couldn't (e.g. no checkpoint). */
		edit: (message: Message, newText: string) => boolean;
		/** Regenerate the AI response following a past message. */
		regenerate: (message: Message) => void;
		/** State-sync bindings (`sync.field(name)`) for this thread — see `createStateSync`. */
		sync: { readonly schema: SchemaStatus; field(name: string): FieldBinding };
	}

	const CONVERSATION_KEY = Symbol.for('slg-conversation');

	/** Read the nearest `Conversation`'s api, or `undefined` outside one. */
	export function useConversation(): ConversationApi | undefined {
		return getContext(CONVERSATION_KEY);
	}
</script>

<script lang="ts">
	import { useStream } from '@langchain/svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		convertThreadMessage,
		InvalidData,
		isCancellationError,
		createStateSync,
		createThreadTitler,
		type FeedbackScore,
		type ToolMessage
	} from '#lib/svelte-langgraph-client/index.ts';
	import MessageComposer from './MessageComposer.svelte';
	import MessagesList from './MessagesList.svelte';
	import type { Checkpoint } from '@langchain/langgraph-sdk';
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import StateField from './StateField.svelte';
	import { useLangGraph } from './langGraphContext.svelte.js';
	import * as m from '#lib/paraglide/messages.js';

	interface Props {
		threadId: string;
		/** Replaces the entire default composition (phase bar, message list, composer). */
		children?: Snippet<[ConversationApi]>;
		/**
		 * Rendered by the default composition in place of the message list while the thread is
		 * bare (`!api.chatStarted`, history loaded) — the phase bar and composer stay. Ignored
		 * when `children` is given. `Conversation` renders nothing there itself.
		 */
		empty?: Snippet<[ConversationApi]>;
	}

	let { threadId, children, empty }: Props = $props();

	const ctx = useLangGraph('Conversation');

	// Read once, at init — `useStream` (below) captures its options once too, so a client or
	// assistant that only becomes available later can't be picked up mid-mount anyway. Callers
	// (`ChatSurface`, routes) are responsible for not mounting `Conversation` — or for
	// remounting it via `{#key threadId}` — until the provider has resolved both, exactly as
	// `Chat.svelte`'s callers guarded on `{#if assistantId && client}`. Captured into `const`s
	// so they stay definitely-typed inside the closures declared further down this file.
	if (!ctx.client || !ctx.assistantId) {
		throw new Error(
			'<Conversation> was mounted before its <LangGraph> provider resolved a client and assistantId.'
		);
	}
	const langGraphClient = ctx.client;
	const assistantId = ctx.assistantId;

	const stream = useStream({
		client: langGraphClient,
		assistantId,
		threadId,
		fetchStateHistory: true,
		reconnectOnMount: true
	});

	const sync = createStateSync({ stream, client: langGraphClient, assistantId });

	let current_input = $state('');
	let last_user_message = $state('');
	let aiMessageCountAtSubmit = $state(0);
	// Messages the stream showed for a send the server refused before creating its run: they
	// were never stored, so they are left out of `messages`.
	const refusedIds = new SvelteSet<string>();

	function mapMessages(msgs: typeof stream.messages): Message[] {
		const toolCallArgs = new SvelteMap<string, Record<string, unknown>>();
		const result: Message[] = [];

		for (const msg of msgs) {
			if (msg.id && refusedIds.has(msg.id)) continue;
			const m = msg as unknown as Record<string, unknown>;

			if ((m.type === 'ai' || m.type === 'AIMessageChunk') && Array.isArray(m.tool_calls)) {
				for (const tc of m.tool_calls as Array<{ id?: string; args?: Record<string, unknown> }>) {
					if (tc.id) toolCallArgs.set(tc.id, tc.args ?? {});
				}
			}

			try {
				const normalized = m.type === 'AIMessageChunk' ? { ...m, type: 'ai' } : m;
				const converted = convertThreadMessage(normalized);
				if (converted.type === 'tool') {
					(converted as ToolMessage).payload = toolCallArgs.get(converted.id);
				}
				result.push(converted);
			} catch {
				// Skip unconvertible messages (e.g. unexpected types during streaming)
			}
		}

		return result;
	}

	let messages = $derived(mapMessages(stream.messages));
	let rawMessageById = $derived(
		new Map(stream.messages.flatMap((m) => (m.id ? ([[m.id, m]] as const) : [])))
	);

	let generationError = $derived(
		!isCancellationError(stream.error) && stream.error != null
			? stream.error instanceof Error
				? stream.error
				: new Error(String(stream.error))
			: null
	);

	let chat_started = $derived(messages.length > 0 || stream.isLoading || generationError != null);
	let final_answer_started = $derived(
		!stream.isLoading || messages.filter((m) => m.type === 'ai').length > aiMessageCountAtSubmit
	);

	// `stream.submit` resolves (never rejects) once the run settles; a failure lands in
	// `stream.error`. The stream shows the input messages at once. When `onError` gets no run,
	// the client learned of none: the server refused the request (e.g. a 401) or it never left,
	// so the input was not stored. Hide those messages, so the list shows what the thread holds,
	// and resolve `true`. One case looks the same: the server stored the run but its response
	// was lost; then a stored message is hidden until the next run, and a plain send offers its
	// text again. An abort or timeout skips `onError`: nothing is hidden or put back.
	async function send(input: { messages: unknown[] }, options?: { checkpoint: Checkpoint }) {
		const before = new Set(stream.messages.map((m) => m.id));
		let refused = false;
		await stream.submit(input, {
			...options,
			onError: (_error, run) => {
				refused = run === undefined;
			}
		});
		if (!refused) return false;
		for (const m of stream.messages) if (m.id && !before.has(m.id)) refusedIds.add(m.id);
		return true;
	}

	// A refused plain send would lose the text: put it back in the composer, unless the user has
	// started typing something else meanwhile (Retry still sends it). An edit only hides its
	// refused message, which leaves the old branch shown; its text is not put back.
	async function submitHumanMessage(text: string) {
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		const refused = await send({ messages: [{ type: 'human', content: text }] });
		if (refused && current_input === '') current_input = text;
	}

	function submitInput(text?: string) {
		if (text === undefined) {
			submitWithoutMessage();
			return;
		}
		if (stream.isLoading || stream.isThreadLoading) return;
		last_user_message = text;
		current_input = '';
		void submitHumanMessage(text);
	}

	function submitWithoutMessage() {
		if (stream.isLoading || stream.isThreadLoading) return;
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		void stream.submit({ messages: [] });
	}

	function retryGenerationAfterError() {
		if (!last_user_message) return;
		// A refused send put the text back in the composer; retrying sends it, so clear it.
		if (current_input === last_user_message) current_input = '';
		void submitHumanMessage(last_user_message);
	}

	function stopGeneration() {
		stream.stop();
	}

	function getParentCheckpoint(message: Message): Checkpoint | null {
		if (!message.id) throw new InvalidData('Message is missing an id', message);
		const rawMsg = rawMessageById.get(message.id);
		if (!rawMsg) throw new InvalidData('Raw message not found for id: ' + message.id, message);
		const metadata = stream.getMessagesMetadata(rawMsg);
		if (!metadata)
			throw new InvalidData('No metadata found for message id: ' + message.id, message);
		// parent_checkpoint is the state just before this message — branching from it replaces the message onwards
		return metadata.firstSeenState?.parent_checkpoint ?? null;
	}

	function handleEdit(message: Message, newText: string): boolean {
		if (stream.isLoading) return false;
		const parentCheckpoint = getParentCheckpoint(message);
		if (!parentCheckpoint) return false;
		// Snapshot AI count so final_answer_started tracks the new response correctly
		last_user_message = newText; // keep retry in sync with the edited prompt
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		void send(
			{ messages: [{ type: 'human', content: newText }] },
			{ checkpoint: parentCheckpoint }
		);
		return true;
	}

	function handleRegenerate(message: Message) {
		if (stream.isLoading) return;
		const parentCheckpoint = getParentCheckpoint(message);
		if (!parentCheckpoint) return;
		// last_user_message is intentionally not updated here — retryGenerationAfterError only
		// applies to user-initiated sends, not regenerations
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		stream.submit(undefined, { checkpoint: parentCheckpoint });
	}

	function rateMessage(message: Message, type: FeedbackScore, comment?: string) {
		return langGraphClient.submitFeedback(threadId, message.id, type, comment);
	}

	// Nudge the sidebar's thread list once a run settles, so a freshly titled/updated/regenerated
	// thread moves to the top. Fires on the isLoading true→false edge — not on message-count
	// changes — so a same-length regenerate still refreshes. Safe against the initial history
	// fetch: `isLoading` reflects only an active run, never the separate history hydration
	// (`isThreadLoading`).
	//
	// This fires on every settle within the mount, including a stop()-cancelled or errored run
	// (both flip `isLoading` through the same finally as a successful completion) — a few extra
	// `threads.search` calls in exchange for correctness. Don't "optimize" this back to a
	// success-only check.
	let wasLoading = false;

	const titler = createThreadTitler({
		client: langGraphClient,
		threadId,
		onTitled: () => ctx.threadList.refresh()
	});
	onDestroy(() => titler.dispose());

	$effect(() => {
		const loading = stream.isLoading;
		const settled = wasLoading && !loading;
		wasLoading = loading;
		if (!settled) return;
		untrack(() => {
			ctx.threadList.refresh();
			// The titler awaits the response and cancels its request on unmount.
			// `<LangGraph titles={false}>`: the backend has no `/titles` route.
			if (ctx.titles) void titler.ensureThreadTitle(stream.messages);
		});
	});

	// Backfill on open: a pre-existing untitled thread with a complete opening exchange gets a
	// title without waiting for the next message (e.g. a tab closed before the first settle ran).
	let backfillAttempted = false;

	$effect(() => {
		if (stream.isThreadLoading || backfillAttempted) return;
		backfillAttempted = true;
		untrack(() => {
			if (ctx.titles) void titler.ensureThreadTitle(stream.messages);
		});
	});

	// Report history-loading state up so the sidebar can mark this thread's row as pending.
	// `threadId` is fixed per instance — callers remount `Conversation` via `{#key threadId}`.
	$effect(() => {
		ctx.setThreadLoading(threadId, stream.isThreadLoading);
	});

	onDestroy(() => ctx.setThreadLoading(threadId, false));

	const api: ConversationApi = {
		get messages() {
			return messages;
		},
		get input() {
			return current_input;
		},
		setInput(value: string) {
			current_input = value;
		},
		get isLoading() {
			return stream.isLoading;
		},
		get isThreadLoading() {
			return stream.isThreadLoading;
		},
		get chatStarted() {
			return chat_started;
		},
		get finalAnswerStarted() {
			return final_answer_started;
		},
		get error() {
			return generationError;
		},
		submit: submitInput,
		retry: retryGenerationAfterError,
		stop: stopGeneration,
		edit: handleEdit,
		regenerate: handleRegenerate,
		sync
	};

	setContext(CONVERSATION_KEY, api);
</script>

{#if children}
	{@render children(api)}
{:else}
	<!--
		Default composition — deliberately expressed purely in terms of `api`, the same object
		handed to `children`, so a caller replacing this wholesale via `children` can build on
		the same surface. `Suggestions`/intro are NOT rendered here: unlike `Chat.svelte`, which
		mixed conversation mechanics with that app-content empty state, `Conversation` is the
		pure mechanics half. It only leaves the `empty` slot for that content — `ChatSurface` is
		the layer that fills it with Suggestions for a bare thread (SLG-133 PR 3), rather than
		copying this whole composition into `children` just to add one branch.
	-->
	<div class="flex h-full min-h-0 flex-col">
		<!-- Slim state-field bar — renders nothing when schema is unavailable (degraded mode) -->
		<div class="flex justify-end px-4 py-1">
			<StateField name="phase" field={api.sync.field('phase')} />
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto pb-4" aria-busy={api.isThreadLoading}>
			{#if api.isThreadLoading}
				<div data-testid="chat-history-loading" class="mx-auto w-full max-w-4xl space-y-4 p-4">
					<p class="sr-only" role="status" aria-live="polite">{m.slg_chat_history_loading()}</p>
					<div class="bg-muted h-16 w-3/4 animate-pulse rounded-lg"></div>
					<div class="bg-muted h-16 w-full animate-pulse rounded-lg"></div>
					<div class="bg-muted h-16 w-1/2 animate-pulse rounded-lg"></div>
				</div>
			{:else if empty && !api.chatStarted}
				{@render empty(api)}
			{:else}
				<MessagesList
					messages={api.messages}
					finalAnswerStarted={api.finalAnswerStarted}
					isStreaming={api.isLoading}
					generationError={api.error}
					onRetryError={api.retry}
					onEdit={api.edit}
					onRegenerate={api.regenerate}
					onFeedback={rateMessage}
				/>
			{/if}
		</div>
		<MessageComposer
			bind:value={() => api.input, (v) => api.setInput(v)}
			isStreaming={api.isLoading}
			disabled={api.isThreadLoading}
			onSubmit={() => api.submit(api.input)}
			onStop={api.stop}
		/>
	</div>
{/if}
