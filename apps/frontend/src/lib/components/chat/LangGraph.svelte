<script lang="ts">
	/**
	 * `<LangGraph>` — the embeddable-API provider (SLG-133 PR 3).
	 *
	 * Instantiates one `LangGraphContext`, sets it in context, and owns every wiring `$effect`
	 * that keeps it current: deriving the client from `url`/`token`/`headers` (or accepting the
	 * `client` prop escape hatch), resolving the assistant, and syncing the owned `ThreadList`
	 * state. Descendants (`Conversation`, `ThreadList`, `ChatSurface`, ...) read the context via
	 * `useLangGraph()`/`useLangGraphOptional()` — they never resolve an assistant themselves.
	 *
	 * Renders the patched `Sidebar.Provider` as its own wrapper element, with `children` directly
	 * inside — no intervening wrapper div. `Sidebar.Provider`'s `peer`/`group` Tailwind contract
	 * requires the sidebar (`ThreadList`, via `Sidebar.Root`) and the main content pane to be its
	 * literal flex children, so anything this component put between itself and `children` would
	 * break that contract for consumers.
	 */
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { Client } from '@langchain/langgraph-sdk';
	import { createClient, getOrCreateAssistant, type ThreadSummary } from '@svelte-langgraph/client';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { LangGraphContext, setLangGraphContext } from './langGraphContext.svelte.js';
	import type { DeepPartial, LangGraphLabels } from './labels.js';

	interface Props {
		/** LangGraph server API URL. Ignored when the `client` escape hatch is given. */
		url?: string;
		/** Bearer token. Derived on the token *string* so unrelated re-renders don't mint a new client. */
		token?: string | null;
		headers?: Record<string, string>;
		/** Escape hatch: supply a pre-built client directly. Always wins over `url`/`token`/`headers`. */
		client?: Client;
		/** Graph id used to resolve/create the assistant. Defaults to `'chat'`. */
		graph?: string;
		/** Skip assistant resolution entirely and use this id. */
		assistantId?: string;
		/** Controlled active thread id. Omit for uncontrolled (internal) mode; pass `null`/a string to control it. */
		activeThreadId?: string | null;
		onThreadChange?: (id: string | null) => void;
		hrefFor?: (t: ThreadSummary) => string;
		labels?: DeepPartial<LangGraphLabels>;
		sidebarOpen?: boolean;
		class?: string;
		children: Snippet;
	}

	let {
		url,
		token,
		headers,
		client: clientProp,
		graph = 'chat',
		assistantId: assistantIdProp,
		activeThreadId: activeThreadIdProp,
		onThreadChange,
		hrefFor,
		labels,
		sidebarOpen = $bindable(true),
		class: className,
		children
	}: Props = $props();

	// Captured once, from the *initial* props: whether the owned `ThreadListState` should start
	// in the loading state (SSR — see `ThreadListOptions.initialLoading`, and `+layout.svelte`'s
	// existing `Boolean(page.data.session?.accessToken)` precedent).
	const ctx = new LangGraphContext({ initialLoading: Boolean(token || clientProp) });
	setLangGraphContext(ctx);

	// Derive the client on the token *string* (not a session object) so navigations that keep the
	// same token don't mint a new `Client` and restart the thread fetch — see `+layout.svelte`'s
	// existing discipline, preserved here. `client` is a pure escape hatch and always wins.
	let derivedClient = $derived.by(
		() => clientProp ?? (token ? createClient(url ?? '', token, headers) : undefined)
	);

	$effect(() => {
		ctx.setClient(derivedClient);
	});

	$effect(() => {
		ctx.threadList.setClient(derivedClient ?? null);
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
		ctx.setLabels(labels);
	});

	// Assistant resolution — children never do this themselves. Re-resolves whenever the
	// *effective* client changes (e.g. a fresh token); the `assistantId` prop always wins and
	// skips resolution entirely. `resolvedFor` is a plain (non-reactive) tracking variable, same
	// pattern as `Chat.svelte`'s `wasLoading` — it only needs to be read/written imperatively
	// inside this effect, never as a template/derived dependency.
	let resolvedFor: Client | undefined;
	$effect(() => {
		if (assistantIdProp !== undefined) {
			resolvedFor = undefined;
			ctx.setAssistantId(assistantIdProp);
			ctx.setError(undefined);
			return;
		}

		const client = derivedClient;
		if (!client) {
			resolvedFor = undefined;
			ctx.setAssistantId(undefined);
			return;
		}
		if (resolvedFor === client) return;
		resolvedFor = client;

		ctx.setAssistantId(undefined);
		ctx.setError(undefined);
		let cancelled = false;
		getOrCreateAssistant(client, graph)
			.then((id) => {
				if (!cancelled) ctx.setAssistantId(id);
			})
			.catch((err) => {
				if (!cancelled) ctx.setError(err instanceof Error ? err : new Error(String(err)));
			});
		return () => {
			cancelled = true;
		};
	});

	onDestroy(() => ctx.dispose());
</script>

<Sidebar.Provider bind:open={sidebarOpen} class={className}>
	{@render children()}
</Sidebar.Provider>
