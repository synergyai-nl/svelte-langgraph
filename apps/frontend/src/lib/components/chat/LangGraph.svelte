<script lang="ts">
	/**
	 * `<LangGraph>` — the embeddable-API provider (SLG-133 PR 3).
	 *
	 * Instantiates one `LangGraphContext`, sets it in context, and owns every wiring `$effect`
	 * that keeps it current: deriving the client from `url`/`token`/`headers` (or accepting the
	 * `client` prop escape hatch), resolving the assistant, and syncing the owned `ThreadList`
	 * state. Descendants (`Conversation`, `ThreadList`, `ChatSurface`, ...) read the context via
	 * `useLangGraph()` — they never resolve an assistant themselves.
	 *
	 * The provider is mandatory, the same way shadcn's `Sidebar.*` requires `Sidebar.Provider`:
	 * `ThreadList`, `Conversation` and `ChatSurface` must be rendered inside `<LangGraph>` and
	 * throw at init otherwise. Their props override context values; they are
	 * not a provider-less alternative.
	 *
	 * Renders no DOM of its own: `children` go straight into the caller's markup, inside a
	 * `Tooltip.Provider` with no delay (Bits UI tooltips need an ancestor provider). It renders no
	 * `Sidebar.Provider` either: the caller owns that, as in shadcn. Wrap `ThreadList` and the
	 * content pane in your own stock `Sidebar.Provider` (see `routes/chat/+layout.svelte`).
	 */
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { RequestHook } from '@langchain/langgraph-sdk';
	import {
		createClient,
		getOrCreateAssistant,
		type ThreadSummary,
		type AppClient,
		type TokenSource
	} from '#lib/svelte-langgraph-client/index.ts';
	import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
	import { LangGraphContext, setLangGraphContext } from './langGraphContext.svelte.js';

	interface Props {
		/** LangGraph server API URL. Ignored when the `client` escape hatch is given. */
		url?: string;
		/**
		 * Bearer token, or a function returning the current one before every request. A string is
		 * derived on its value, a function on its identity, so unrelated re-renders don't mint a new
		 * client. Pass a function defined once (not an inline arrow) to refresh tokens without ever
		 * re-minting the client, which would remount the conversation.
		 */
		token?: TokenSource;
		/** Extra request headers. Derived on their serialized *contents*, like `token`, so an inline object literal doesn't mint a new client on every re-render. */
		headers?: Record<string, string>;
		/**
		 * The SDK's own `onRequest`: runs once per SDK request after the bearer is set (HTTP retries
		 * reuse its result; stream reconnects call it again) and may return a changed `RequestInit`.
		 * The title and feedback routes do not pass through it. Read per request, so a new function
		 * never mints a new client. No effect with `client`.
		 */
		onRequest?: RequestHook;
		/** Escape hatch: supply a pre-built client directly. Always wins over `url`/`token`/`headers`. */
		client?: AppClient;
		/**
		 * Graph id used to resolve/create the assistant, to tag new threads (`metadata.graph_id`) and
		 * to filter the thread list. Defaults to `'chat'`.
		 */
		graph?: string;
		/**
		 * Skip assistant resolution entirely and use this id. `graph` must still name this
		 * assistant's graph: it tags new threads and filters the list, and the server re-tags a
		 * thread with the assistant's graph on its first run, which would drop it from the list.
		 */
		assistantId?: string;
		/** Controlled active thread id. Omit for uncontrolled (internal) mode; pass `null`/a string to control it. */
		activeThreadId?: string | null;
		onThreadChange?: (id: string | null) => void;
		/** Thread row links for `ThreadList`; must return a resolved path (see `ThreadList`). */
		hrefFor?: (t: ThreadSummary) => string;
		/**
		 * Set `false` when the backend has no `POST {url}/titles` route (the demo backend's custom
		 * route, see the README's "Backend routes"): no thread titles are requested. Defaults to `true`.
		 */
		titles?: boolean;
		/**
		 * Set `false` for an app without a thread list: no `POST {url}/threads/search` is sent, not at
		 * start, after a run or after a title. Titles still follow `titles`. A `ThreadList` rendered
		 * anyway shows its empty state. Set at mount. Defaults to `true`.
		 */
		threadList?: boolean;
		children: Snippet;
	}

	let {
		url,
		token,
		headers,
		onRequest,
		client: clientProp,
		graph = 'chat',
		assistantId: assistantIdProp,
		activeThreadId: activeThreadIdProp,
		onThreadChange,
		hrefFor,
		titles = true,
		threadList = true,
		children
	}: Props = $props();

	// Captured once, from the *initial* props: whether the owned `ThreadListState` should start
	// in the loading state (SSR — see `ThreadListOptions.initialLoading`, and `+layout.svelte`'s
	// existing `Boolean(page.data.session)` precedent).
	const ctx = new LangGraphContext({ initialLoading: threadList && Boolean(token || clientProp) });
	setLangGraphContext(ctx);

	// Derive the client on the token *string* (not a session object) so navigations that keep the
	// same token don't mint a new `Client` and restart the thread fetch — see `+layout.svelte`'s
	// existing discipline, preserved here. A token *function* is read per request by the client
	// itself, so the derivation keys on its identity and a refresh never mints a new client.
	// `client` is a pure escape hatch and always wins.
	//
	// `headers` gets the same treatment via `headersKey`: read by object identity, an inline
	// `headers={{ 'X-Org': id }}` is a fresh object on every parent re-render and would mint a
	// new client each time. The serialized string only changes when the contents do, and a
	// `$derived` whose value is unchanged (`===`) doesn't propagate — so `derivedClient` below
	// reads only `headersKey`, never `headers` itself. Key order counts as a change; harmless,
	// since an inline literal keeps its order across re-renders.
	//
	// `onRequest` is not read here at all: `forwardRequest` reads the current prop per request.
	const headersKey = $derived(headers ? JSON.stringify(headers) : '');
	const forwardRequest: RequestHook = (requestUrl, init) =>
		onRequest ? onRequest(requestUrl, init) : init;
	let derivedClient = $derived.by(
		() =>
			clientProp ??
			(token
				? createClient(url ?? '', token, headersKey ? JSON.parse(headersKey) : undefined, {
						onRequest: forwardRequest
					})
				: undefined)
	);

	$effect(() => {
		ctx.setClient(derivedClient, graph);
	});

	// `threadList={false}`: the list never gets a client, so its loads, refreshes and pin fetches
	// are all no-ops.
	$effect(() => {
		ctx.threadList.setClient(threadList ? (derivedClient ?? null) : null, graph);
	});

	$effect(() => {
		ctx.threadList.setActiveThreadId(ctx.activeThreadId);
	});

	$effect(() => {
		ctx.setActiveThreadIdProp(activeThreadIdProp, onThreadChange);
	});

	$effect(() => {
		ctx.setHrefFor(hrefFor);
	});

	$effect(() => {
		ctx.setTitles(titles);
	});

	// Assistant resolution — children never do this themselves. Re-resolves whenever the
	// *effective* client or the `graph` prop changes; the `assistantId` prop always wins and
	// skips resolution entirely. `resolvedFor` is a plain (non-reactive) tracking variable, same
	// pattern as `Chat.svelte`'s `wasLoading` — it only needs to be read/written imperatively
	// inside this effect, never as a template/derived dependency.
	let resolvedFor: { client: AppClient; graph: string } | undefined;
	let resolutionCounter = 0;
	$effect(() => {
		if (assistantIdProp !== undefined) {
			resolvedFor = undefined;
			// Invalidate any in-flight resolution: without this, a pending getOrCreateAssistant
			// from before the explicit prop arrived would still pass the token check below and
			// overwrite the explicit id (or surface its stale error).
			resolutionCounter++;
			ctx.setAssistantId(assistantIdProp);
			ctx.setError(undefined);
			return;
		}

		// Tracked so a thread navigation re-runs this effect: a FAILED resolution clears
		// `resolvedFor` below, and this dependency is what gives it a retry opportunity —
		// mirroring the old per-page resolution, which re-ran on every thread click. While a
		// resolution is in place the guard below short-circuits, so the extra runs are free.
		// `resolutionNonce` is the explicit retry lever (`ctx.retryResolution()`) for consumers
		// with no navigation to lean on.
		void ctx.activeThreadId;
		void ctx.resolutionNonce;

		const client = derivedClient;
		if (!client) {
			resolvedFor = undefined;
			// Invalidate any in-flight resolution from the departed client (see the prop branch
			// above for why).
			resolutionCounter++;
			ctx.setAssistantId(undefined);
			// A signed-out/clientless provider shows the loader/login path, not a stale
			// resolution error from the previous client.
			ctx.setError(undefined);
			return;
		}
		if (resolvedFor?.client === client && resolvedFor.graph === graph) return;
		resolvedFor = { client, graph };

		ctx.setAssistantId(undefined);
		ctx.setError(undefined);
		// Supersession token, NOT an effect-cleanup flag: the `activeThreadId` dependency above
		// re-runs this effect on every navigation, and a cleanup-based cancel would abort an
		// in-flight resolution on runs that then short-circuit at the guard. A result only
		// applies while it is still the latest started resolution.
		const started = ++resolutionCounter;
		getOrCreateAssistant(client, graph)
			.then((id) => {
				if (started === resolutionCounter) ctx.setAssistantId(id);
			})
			.catch((err) => {
				if (started === resolutionCounter) {
					resolvedFor = undefined;
					console.error('Assistant resolution failed', err);
					ctx.setError(err instanceof Error ? err : new Error(String(err)));
				}
			});
	});

	onDestroy(() => ctx.dispose());
</script>

<Tooltip.Provider delayDuration={0}>
	{@render children()}
</Tooltip.Provider>
