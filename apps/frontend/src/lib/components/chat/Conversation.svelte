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
		historyLoading: 'Loading conversation history…'
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

	// --- Thread title mirroring (SLG-117) ---
	//
	// The graph writes a generated title into state under `title` (surfaced here as
	// `stream.values.title`). `threads.search` — what the sidebar list is built from — never
	// returns `values`, only `metadata`, so the title has to be copied into thread metadata to be
	// visible there. `client.threads.update` is Aegra's shallow merge (`current_metadata.update`),
	// so sending only `{ title }` cannot clobber the `owner` key the backend auth stamps.
	//
	// `mirroredTitle` remembers what this instance has already *successfully* written, so a later
	// settle with an unchanged title (e.g. a follow-up turn before the graph updates it again)
	// doesn't reissue an identical PATCH. A failed PATCH is swallowed — a missing/stale title is
	// purely cosmetic and must never surface as a chat error.
	//
	// It is recorded only after the PATCH resolves, which is what makes a transient failure
	// recoverable *within this mount*: the next settle sees `title !== mirroredTitle` and retries.
	// Recording it up front would be a silent one-shot — on a fresh thread the mount-time check
	// has already run (and set `checkedInitialTitle`) before the title ever existed, so it cannot
	// act as the safety net here, and the thread would stay untitled until the next page load.
	let mirroredTitle: string | undefined;

	// All metadata writes go through one serialized chain, and each resolves the thread's "title
	// authority" before writing.
	//
	// Serializing matters because two settles can otherwise leave two PATCHes in flight —
	// reachable via regenerate, which branches from the pre-answer checkpoint and so generates a
	// *different* title (see `test_regenerate_reexecutes_model`) — and Aegra's metadata write is
	// last-write-wins, so a slower first PATCH landing second persists the stale title.
	let mirrorQueue: Promise<void> = Promise.resolve();

	function enqueue(task: () => Promise<void>): Promise<void> {
		// A rejected link must not poison the chain for later work. (Nothing queued here actually
		// rejects — the write swallows its own errors — but this keeps that a local property rather
		// than an invariant every caller has to preserve.)
		mirrorQueue = mirrorQueue.catch(() => {}).then(task);
		return mirrorQueue;
	}

	// Authority: whether `thread.metadata.title` holds a title this component must not overwrite,
	// because something other than this mount put it there. `client.threads.update` is public SDK
	// surface, so another tab or client can rename a thread today, and the rename UI listed as a
	// follow-up would rest on the same guarantee.
	//
	// Resolved lazily *inside the queue, on the first write attempt* — deliberately not as a
	// mount-time step. A mount-time check has to answer three awkward questions that this does
	// not: what if the graph has no title yet at mount, so there is nothing to compare the stored
	// value against; what if the lookup fails, where a one-shot flag would let every later write
	// through; and what if a run settles before hydration finishes, which *is* reachable — the
	// composer stays live during history loading (`Composer` renders outside the
	// `isThreadLoading` branch and disables only on `isStreaming`, and `submitInput` guards on
	// `stream.isLoading` alone). Resolving on the write path means no write can precede the answer,
	// so none of those orderings matter.
	let authorityResolved = false;

	// The graph title judged non-authoritative, because the thread already carried a *different*
	// stored title. Keyed on the value rather than a flag, so a genuinely regenerated title (a
	// different string) can still be mirrored instead of titling being dead for the rest of the
	// mount.
	//
	// That choice is the deliberate limit of what this can do, and it is worth being explicit
	// about why. `metadata.title` is a bare string with no record of *who* set it, so "the user
	// renamed this thread" and "an earlier run generated this title" are the same value to us.
	// Every heuristic here — comparing against the graph title, against what this mount wrote —
	// is an attempt to infer that missing provenance, and each can be wrong at the edges: a
	// rename that lands after we have already mirrored a title can still be overwritten by a
	// later regeneration, because nothing distinguishes it from our own stale write.
	//
	// The real fix is to record the distinction in metadata (an auto-generated vs user-set
	// marker) and let a user-set title win outright. That belongs with user-editable titles,
	// which are out of scope here — see the PR's follow-ups. Until then this deliberately errs
	// toward preserving a stored title, and the residual window above is accepted rather than
	// papered over with more inference.
	let suppressedGraphTitle: string | undefined;

	// Titles this mount successfully wrote itself. Distinct from `mirroredTitle`, which also
	// records titles merely *observed* in metadata — only provenance can tell our own earlier
	// write apart from someone else's rename when re-resolving authority (see `ensureAuthority`).
	//
	// Known limitation: this is per-mount, so the ambiguity returns on reopen. If a regenerated
	// title's write failed and the thread is then reopened, the fresh mount sees a stored title
	// differing from the graph's with no provenance to appeal to, and suppresses — leaving the
	// sidebar stale rather than risking a rename. That trade-off is deliberate: the two cases are
	// genuinely indistinguishable from a cold start, and silently overwriting a rename is the
	// worse failure.
	let lastWriteByThisMount: string | undefined;

	/**
	 * Resolve title authority if not already known. Returns false when it could not be determined,
	 * in which case the caller must not write — a transient `threads.get` failure on a renamed
	 * thread would otherwise let the generated title overwrite the rename. `authorityResolved`
	 * stays false so the next settle retries rather than being blocked forever.
	 */
	async function ensureAuthority(graphTitle: string): Promise<boolean> {
		if (authorityResolved) return true;
		try {
			const thread = await langGraphClient.threads.get(threadId);
			const storedTitle = thread.metadata?.title;
			if (typeof storedTitle === 'string' && storedTitle.length > 0) {
				mirroredTitle = storedTitle;
				// A stored title is someone else's only if it is neither the title we are about to
				// write nor one this mount wrote itself.
				//
				// The provenance half matters after a failed write. Say we mirrored A, a
				// regeneration produced B, and B's PATCH failed — that failure clears
				// `authorityResolved`, so the retry lands here and re-reads A. Comparing against
				// `graphTitle` alone would read "stored A ≠ graph B" as an external rename and
				// suppress B permanently, leaving the sidebar stale with the write never retried.
				// `lastWriteByThisMount` records that A was our own, so B is recognised as a
				// legitimate update.
				const storedIsOurs = storedTitle === graphTitle || storedTitle === lastWriteByThisMount;
				if (!storedIsOurs) suppressedGraphTitle = graphTitle;
			}
			authorityResolved = true;
			return true;
		} catch {
			return false;
		}
	}

	/** The actual PATCH. Only ever called from inside a queued task. */
	async function writeTitle(title: string): Promise<void> {
		// Checked here, not by the caller: by the time this runs, an earlier queued write may
		// already have persisted this exact title.
		if (title === mirroredTitle) return;
		try {
			await langGraphClient.threads.update(threadId, { metadata: { title } });
			mirroredTitle = title;
			lastWriteByThisMount = title;
			// Any standing suppression is now obsolete. It protected a stored title that this
			// write has just deliberately replaced, so continuing to block the graph title it was
			// keyed to would discard a legitimate later regeneration back to that value — which
			// `get_title_model`'s `temperature=0` makes likely rather than exotic, since
			// regenerating over the same opening exchange tends to produce the same title.
			suppressedGraphTitle = undefined;
		} catch {
			// Best-effort: a missing or stale title is cosmetic and must never surface as a chat
			// error. Leaving `mirroredTitle` unset lets the next settle retry.
			//
			// That retry must not trust the cached authority, though. Our view of the metadata is
			// now stale by an unknown amount — the write failed, and whatever happens next is
			// unobserved — so another tab or SDK client could rename the thread before we try
			// again. Re-reading is one extra GET on a path that is already failing.
			authorityResolved = false;
		}
	}

	/** Queue a mirror of `title`, resolving authority first. Resolves true if it actually wrote. */
	function mirrorTitle(title: string): Promise<boolean> {
		let wrote = false;
		return enqueue(async () => {
			if (!(await ensureAuthority(title))) return;
			if (title === suppressedGraphTitle) return;
			// Re-read: the graph's title can move on while the awaited work above is in flight, and
			// writing this captured value would then overwrite the newer one.
			if (stream.values.title !== title) return;
			const before = mirroredTitle;
			await writeTitle(title);
			wrote = mirroredTitle !== before;
		}).then(() => wrote);
	}

	$effect(() => {
		const loading = stream.isLoading;
		const settled = wasLoading && !loading;
		wasLoading = loading;
		if (!settled) return;
		untrack(() => {
			const title = stream.values.title;
			void (async () => {
				// Await the write before refreshing — that is what makes the sidebar pick up the new
				// title on this refresh rather than the next one. With no title there is nothing to
				// queue, which is the overwhelmingly common settle.
				if (typeof title === 'string' && title.length > 0) await mirrorTitle(title);
				ctx?.threadList.refresh();
			})();
		});
	});

	// Backfill on open: if the graph carries a title that never reached the thread's metadata — a
	// settle-time PATCH that failed, or a tab closed mid-run — mirror it without waiting for the
	// user to send another message. It runs through `mirrorTitle` like every other write, so it
	// resolves authority first and cannot overwrite a title set elsewhere.
	let backfillAttempted = false;

	$effect(() => {
		const threadLoading = stream.isThreadLoading;
		if (threadLoading || backfillAttempted) return;
		backfillAttempted = true;
		untrack(() => {
			const title = stream.values.title;
			if (typeof title !== 'string' || title.length === 0) return;
			void (async () => {
				if (await mirrorTitle(title)) ctx?.threadList.refresh();
			})();
		});
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
