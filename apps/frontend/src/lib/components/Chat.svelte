<script lang="ts">
	import { useStream } from '@langchain/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		convertThreadMessage,
		InvalidData,
		createStateSync,
		getThreadListRefresh,
		getThreadLoadingReporter,
		type Message,
		type ToolMessage
	} from '@svelte-langgraph/client';
	import Composer, { type ComposerLabels } from './chat/Composer.svelte';
	import MessagesList, { type MessagesListLabels } from './chat/MessagesList.svelte';
	import Suggestions, { type ChatSuggestion } from './chat/Suggestions.svelte';
	import type { Client, Checkpoint } from '@langchain/langgraph-sdk';
	import { onDestroy, untrack } from 'svelte';
	import StateField from './chat/StateField.svelte';
	import * as m from '$lib/paraglide/messages.js';

	// Localized labels for the de-paraglided chat components (SLG-133). `Chat.svelte` stays
	// app-level — and so keeps its paraglide import — until the embeddable `<LangGraph>` provider
	// (PR 3) takes over supplying these.
	const composerLabels: ComposerLabels = {
		placeholder: m.chat_input_placeholder()
	};
	const messagesListLabels: MessagesListLabels = {
		message: {
			aiActions: {
				copy: m.message_copy(),
				copied: m.message_copied(),
				regenerate: m.message_regenerate(),
				feedback: {
					good: m.message_feedback_good(),
					bad: m.message_feedback_bad(),
					comingSoon: m.coming_soon()
				}
			},
			userActions: {
				edit: m.message_edit()
			},
			userEdit: {
				edit: m.message_edit(),
				cancel: m.cancel(),
				saveAndSend: m.save_and_send()
			},
			thinking: {
				thinking: m.thinking()
			}
		},
		toolMessage: {
			usingTools: m.tools_using(),
			toolLabel: m.tool_label(),
			parameters: m.tool_parameters(),
			noParameters: m.tool_no_parameters(),
			result: m.tool_result()
		},
		errorMessage: {
			retry: m.chat_error_retry()
		}
	};

	interface Props {
		langGraphClient: Client;
		assistantId: string;
		threadId: string;
		suggestions?: ChatSuggestion[];
		intro?: string;
		introTitle?: string;
	}

	let {
		langGraphClient,
		assistantId,
		threadId,
		suggestions = [],
		intro = '',
		introTitle = ''
	}: Props = $props();

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
	// (`isThreadLoading`). The context is optional: Chat renders fine (and stays testable)
	// without it.
	//
	// This fires on every settle within the mount, including a stop()-cancelled or errored run
	// (both flip `isLoading` through the same finally as a successful completion) — a few extra
	// `threads.search` calls in exchange for correctness. Don't "optimize" this back to a
	// success-only check.
	const threadListRefresh = getThreadListRefresh();
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
				threadListRefresh?.refresh();
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
				if (await mirrorTitle(title)) threadListRefresh?.refresh();
			})();
		});
	});

	// Report history-loading state up so the sidebar can mark this thread's row as pending.
	// `threadId` is fixed per instance — the route remounts Chat via `{#key threadId}`.
	const reporter = getThreadLoadingReporter();

	$effect(() => {
		reporter?.setLoading(threadId, stream.isThreadLoading);
	});

	onDestroy(() => reporter?.setLoading(threadId, false));
</script>

<div class="flex h-full min-h-0 flex-col">
	<!-- Slim state-field bar — renders nothing when schema is unavailable (degraded mode) -->
	<div class="flex justify-end px-4 py-1">
		<StateField name="phase" field={sync.field('phase')} />
	</div>
	<div class="min-h-0 flex-1 overflow-y-auto pb-4" aria-busy={stream.isThreadLoading}>
		{#if stream.isThreadLoading}
			<div data-testid="chat-history-loading" class="mx-auto w-full max-w-4xl space-y-4 p-4">
				<p class="sr-only" role="status" aria-live="polite">{m.chat_history_loading()}</p>
				<div class="bg-muted h-16 w-3/4 animate-pulse rounded-lg"></div>
				<div class="bg-muted h-16 w-full animate-pulse rounded-lg"></div>
				<div class="bg-muted h-16 w-1/2 animate-pulse rounded-lg"></div>
			</div>
		{:else if !chat_started}
			<Suggestions
				{suggestions}
				{introTitle}
				{intro}
				onSuggestionClick={(suggestedText) => submitInput(suggestedText)}
			/>
		{:else}
			<MessagesList
				{messages}
				finalAnswerStarted={final_answer_started}
				isStreaming={stream.isLoading}
				{generationError}
				onRetryError={retryGenerationAfterError}
				onEdit={handleEdit}
				onRegenerate={handleRegenerate}
				labels={messagesListLabels}
			/>
		{/if}
	</div>
	<Composer
		bind:value={current_input}
		isStreaming={stream.isLoading}
		onSubmit={() => submitInput(current_input)}
		onStop={() => stopGeneration()}
		labels={composerLabels}
	/>
</div>
