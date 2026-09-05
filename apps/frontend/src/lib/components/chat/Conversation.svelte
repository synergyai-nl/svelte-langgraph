<script lang="ts" module>
	import { defaultComposerLabels, type ComposerLabels } from './Composer.svelte';
	import { defaultMessagesListLabels, type MessagesListLabels } from './MessagesList.svelte';
	import { getContext, setContext } from 'svelte';
	import type { Message, SchemaStatus, FieldBinding } from '@svelte-langgraph/client';

	/**
	 * Purely a pass-through aggregate — `Conversation` renders no label strings of its own except
	 * `historyLoading`, the sr-only status announced while a thread's history is being fetched.
	 */
	export interface ConversationLabels {
		composer: ComposerLabels;
		messagesList: MessagesListLabels;
		historyLoading: string;
	}

	export const defaultConversationLabels: ConversationLabels = {
		composer: defaultComposerLabels,
		messagesList: defaultMessagesListLabels,
		historyLoading: 'Loading conversation…'
	};

	/**
	 * The reactive surface `Conversation` hands to its `children` snippet (and sets as
	 * `ConversationContext` for deep-tree consumers). Everything the component's own default
	 * composition reads is on here too — see the template below — so a caller replacing that
	 * composition via `children` has everything needed to reproduce or extend it.
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
		/** Submit a new user message. No-op while `isLoading` or given only whitespace. */
		submit: (text: string) => void;
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
		/**
		 * Fully-resolved labels (defaults ← context ← prop) — the same value the default
		 * composition renders with. Custom `children` (e.g. `ChatSurface`) read this instead of
		 * re-running `resolveLabels` themselves, keeping precedence logic in one place.
		 */
		labels: ConversationLabels;
	}

	const CONVERSATION_KEY = Symbol.for('slg-conversation');

	/** Read the nearest `Conversation`'s api, or `undefined` outside one. */
	export function useConversation(): ConversationApi | undefined {
		return getContext(CONVERSATION_KEY);
	}
</script>

<script lang="ts">
	import { useStream } from '@langchain/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		convertThreadMessage,
		InvalidData,
		createStateSync,
		getOrCreateAssistant,
		createThreadTitler,
		type ToolMessage
	} from '@svelte-langgraph/client';
	import Composer from './Composer.svelte';
	import MessagesList from './MessagesList.svelte';
	import type { Client, Checkpoint } from '@langchain/langgraph-sdk';
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import StateField from './StateField.svelte';
	import { resolveLabels, type DeepPartial } from './labels.js';
	import { useLangGraphOptional } from './langGraphContext.svelte.js';

	interface Props {
		threadId: string;
		client?: Client;
		assistantId?: string;
		labels?: DeepPartial<ConversationLabels>;
		children?: Snippet<[ConversationApi]>;
	}

	let {
		threadId,
		client: clientProp,
		assistantId: assistantIdProp,
		labels,
		children
	}: Props = $props();

	const ctx = useLangGraphOptional();

	// Resolved once, at init — `useStream` (below) captures its options once too, so a client or
	// assistant that only becomes available later can't be picked up mid-mount anyway. Callers
	// (`ChatSurface`, routes) are responsible for not mounting `Conversation` — or for
	// remounting it via `{#key threadId}` — until both are ready, exactly as `Chat.svelte`'s
	// callers guarded on `{#if assistantId && client}` today.
	//
	// Resolved through small helpers, not an inline `if (!x) throw`, so the resulting `const`s
	// are typed as definitely-defined from declaration — TypeScript's control-flow narrowing
	// from a later guard doesn't reach into closures declared further down this file (the
	// title-mirroring functions), which is exactly where `langGraphClient` is used again.
	function requireClient(client: Client | undefined): Client {
		if (!client) {
			throw new Error(
				'<Conversation> requires a `client` prop or a <LangGraph> provider with a resolved client.'
			);
		}
		return client;
	}
	function requireAssistantId(id: string | undefined): string {
		if (!id) {
			throw new Error(
				'<Conversation> requires an `assistantId` prop or a <LangGraph> provider with a resolved assistantId.'
			);
		}
		return id;
	}

	const langGraphClient = requireClient(clientProp ?? ctx?.client);
	const assistantId = requireAssistantId(assistantIdProp ?? ctx?.assistantId);

	const l = $derived(resolveLabels(defaultConversationLabels, ctx?.labels, labels));

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

	function mapMessages(msgs: typeof stream.messages): Message[] {
		const toolCallArgs = new SvelteMap<string, Record<string, unknown>>();
		const result: Message[] = [];

		for (const msg of msgs) {
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

	function isCancellationError(err: unknown): boolean {
		if (err instanceof Error) {
			return err.name === 'CancelledError' || err.name === 'AbortError';
		}
		// Python server stores cancellation as a raw string in thread task history
		const str = String(err);
		return str.includes('CancelledError') || str.includes('AbortError');
	}

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

	function submitInput(text: string) {
		if (!text.trim() || stream.isLoading) return;
		last_user_message = text;
		current_input = '';
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		stream.submit({ messages: [{ type: 'human', content: text }] });
	}

	function retryGenerationAfterError() {
		if (!last_user_message) return;
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		stream.submit({ messages: [{ type: 'human', content: last_user_message }] });
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
		stream.submit(
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

	// Nudge the sidebar's thread list once a run settles, so a freshly titled/updated/regenerated
	// thread moves to the top. Fires on the isLoading true→false edge — not on message-count
	// changes — so a same-length regenerate still refreshes. Safe against the initial history
	// fetch: `isLoading` reflects only an active run, never the separate history hydration
	// (`isThreadLoading`). The provider is optional: Conversation renders fine (and stays
	// testable) without one.
	//
	// This fires on every settle within the mount, including a stop()-cancelled or errored run
	// (both flip `isLoading` through the same finally as a successful completion) — a few extra
	// `threads.search` calls in exchange for correctness. Don't "optimize" this back to a
	// success-only check.
	let wasLoading = false;

	// Thread titling (SLG-117): the "title" graph runs statelessly, triggered by the frontend, not
	// by the chat graph — see threadTitle.ts for the single-flight/write-only-when-absent logic.
	let titleAssistantIdPromise: Promise<string> | undefined;

	function resolveTitleAssistantId(): Promise<string> {
		if (!titleAssistantIdPromise) {
			// Cache only the success — a transient failure must not permanently wedge retries
			// behind a rejected promise.
			titleAssistantIdPromise = getOrCreateAssistant(langGraphClient, 'title').catch((err) => {
				titleAssistantIdPromise = undefined;
				throw err;
			});
		}
		return titleAssistantIdPromise;
	}

	const titler = createThreadTitler({
		client: langGraphClient,
		threadId,
		resolveTitleAssistantId,
		onTitled: () => ctx?.threadList.refresh()
	});

	$effect(() => {
		const loading = stream.isLoading;
		const settled = wasLoading && !loading;
		wasLoading = loading;
		if (!settled) return;
		untrack(() => {
			ctx?.threadList.refresh();
			// Fire-and-forget: titling is a separate, awaited network round-trip and must not
			// delay the refresh above. `ensureThreadTitle` no-ops once titled, so a regenerate
			// (which re-settles without changing that) never re-titles.
			void titler.ensureThreadTitle(stream.messages);
		});
	});

	// Backfill on open: a pre-existing untitled thread with a complete opening exchange gets a
	// title without waiting for the next message (e.g. a tab closed before the first settle ran).
	let backfillAttempted = false;

	$effect(() => {
		if (stream.isThreadLoading || backfillAttempted) return;
		backfillAttempted = true;
		untrack(() => void titler.ensureThreadTitle(stream.messages));
	});

	// Report history-loading state up so the sidebar can mark this thread's row as pending.
	// `threadId` is fixed per instance — callers remount `Conversation` via `{#key threadId}`.
	$effect(() => {
		ctx?.setThreadLoading(threadId, stream.isThreadLoading);
	});

	onDestroy(() => ctx?.setThreadLoading(threadId, false));

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
		sync,
		get labels() {
			return l;
		}
	};

	setContext(CONVERSATION_KEY, api);
</script>

{#if children}
	{@render children(api)}
{:else}
	<!--
		Default composition — deliberately expressed purely in terms of `api`, the same object
		handed to `children`, so a caller replacing this via `children` (e.g. `ChatSurface`, to
		layer `Suggestions` in for the empty-thread state — see SLG-133 PR 3) can reproduce it
		exactly. `Suggestions`/intro are NOT rendered here: unlike `Chat.svelte`, which mixed
		conversation mechanics with that app-content empty state, `Conversation` is the pure
		mechanics half — `ChatSurface` is the layer that adds Suggestions back for a bare thread.
	-->
	<div class="flex h-full min-h-0 flex-col">
		<!-- Slim state-field bar — renders nothing when schema is unavailable (degraded mode) -->
		<div class="flex justify-end px-4 py-1">
			<StateField name="phase" field={api.sync.field('phase')} />
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto pb-4" aria-busy={api.isThreadLoading}>
			{#if api.isThreadLoading}
				<div data-testid="chat-history-loading" class="mx-auto w-full max-w-4xl space-y-4 p-4">
					<p class="sr-only" role="status" aria-live="polite">{l.historyLoading}</p>
					<div class="bg-muted h-16 w-3/4 animate-pulse rounded-lg"></div>
					<div class="bg-muted h-16 w-full animate-pulse rounded-lg"></div>
					<div class="bg-muted h-16 w-1/2 animate-pulse rounded-lg"></div>
				</div>
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
{/if}
