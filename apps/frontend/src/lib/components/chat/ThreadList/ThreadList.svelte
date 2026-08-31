<script lang="ts" module>
	export interface ThreadListLabels {
		newChat: string;
		threadsLabel: string;
		empty: string;
		loading: string;
		error: string;
		/** Shown when a context-defaulted "New chat" creation fails (see the `error` prop). */
		newChatError: string;
		retry: string;
		loadMore: string;
		/** `Sheet.Title` for the mobile drawer's sr-only header. */
		mobileTitle: string;
		/** `Sheet.Description` for the mobile drawer's sr-only header. */
		mobileDescription: string;
	}

	export const defaultThreadListLabels: ThreadListLabels = {
		newChat: 'New chat',
		threadsLabel: 'Conversations',
		empty: 'No conversations yet',
		loading: 'Loading conversations',
		error: "Couldn't load your conversations.",
		newChatError: "Couldn't start a new chat. Please try again.",
		retry: 'Try again',
		loadMore: 'Load more',
		mobileTitle: 'Sidebar',
		mobileDescription: 'Displays the mobile sidebar.'
	};

	/** Fixed number of skeleton rows shown while the first page is loading. Not configurable. */
	const SKELETON_COUNT = 5;
</script>

<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ThreadListItem from './ThreadListItem.svelte';
	import type { ThreadSummary, ThreadListState } from '@svelte-langgraph/client';
	import type { Snippet } from 'svelte';
	import { resolveLabels, type DeepPartial } from '../labels.js';
	import { useLangGraphOptional } from '../langGraphContext.svelte.js';

	interface Props {
		/** The reactive thread list instance, consumed whole. Defaults to the ambient `<LangGraph>` context's. */
		list?: ThreadListState;
		activeThreadId?: string | null;
		/** The row navigation is currently in flight for; renders a trailing spinner. */
		pendingThreadId?: string | null;
		/**
		 * Start a new conversation. Defaults to the ambient `<LangGraph>` context's `createThread()`.
		 * The mobile drawer close is handled internally, but only once this resolves to something
		 * other than `false` — return `false` to report failure and keep the drawer open, so an
		 * `error` rendered inside it stays visible.
		 */
		onNewThread?: () => void | boolean | Promise<void | boolean>;
		/**
		 * Thread creation in flight; disables the "New chat" button alongside `disabled`. Defaults
		 * to the ambient context's own `creatingThread`, which only matters together with a
		 * default `onNewThread` — an explicit `onNewThread` should generally come with an explicit
		 * `busy` too.
		 */
		busy?: boolean;
		/** No client / signed out; disables the "New chat" button. */
		disabled?: boolean;
		/** When given, rows render as real `<a href>`s instead of `<button>`s. */
		hrefFor?: (t: ThreadSummary) => string;
		/** Side-effect only; the mobile drawer close is handled internally. */
		onSelect?: (id: string) => void;
		/** Per-row override; when given, replaces the default row content. */
		item?: Snippet<[ThreadSummary]>;
		/**
		 * Caller-supplied failure (e.g. thread creation), rendered as an inline alert near "New
		 * chat". Defaults to the ambient context's own `createThreadError`, for the same reason as
		 * `busy` above.
		 */
		error?: string | null;
		labels?: DeepPartial<ThreadListLabels>;
	}

	const ctx = useLangGraphOptional();

	// Context-sourced defaults are computed via explicit `$derived`, not destructuring defaults:
	// destructuring defaults are evaluated once (see `Composer.svelte`'s `resolvedPlaceholder`
	// for the same pattern) and would not track later changes to `ctx`'s reactive fields.
	let {
		list: listProp,
		activeThreadId: activeThreadIdProp,
		pendingThreadId: pendingThreadIdProp,
		onNewThread: onNewThreadProp,
		busy: busyProp,
		disabled = false,
		hrefFor: hrefForProp,
		onSelect,
		item,
		error: errorProp,
		labels
	}: Props = $props();

	/**
	 * Trivial stand-in used only when neither a `list` prop nor a `<LangGraph>` ancestor is
	 * present — keeps the component inert rather than crashing. Not expected in real usage: every
	 * caller either passes `list` explicitly or renders inside `<LangGraph>`.
	 */
	const emptyList: Pick<
		ThreadListState,
		'threads' | 'loading' | 'error' | 'hasMore' | 'refresh' | 'loadMore' | 'retry'
	> = {
		threads: [],
		loading: false,
		error: null,
		hasMore: false,
		refresh: () => {},
		loadMore: () => {},
		retry: () => {}
	};

	const list = $derived(listProp ?? ctx?.threadList ?? emptyList);
	const activeThreadId = $derived(activeThreadIdProp ?? ctx?.activeThreadId ?? null);
	const pendingThreadId = $derived(pendingThreadIdProp ?? ctx?.pendingThreadId ?? null);
	const onNewThread = $derived(
		onNewThreadProp ?? (() => ctx?.createThread() ?? Promise.resolve(false))
	);
	const busy = $derived(busyProp ?? ctx?.creatingThread ?? false);
	const hrefFor = $derived(hrefForProp ?? ctx?.hrefFor);

	const l = $derived(resolveLabels(defaultThreadListLabels, ctx?.labels?.threadList, labels));

	// The context records the raw `Error` (useful to programmatic consumers), but the alert shows
	// the localizable label — surfacing `error.message` would leak transport noise like
	// `HTTP 400: {...}` into the sidebar.
	const error = $derived(errorProp ?? (ctx?.createThreadError ? l.newChatError : null));

	const sidebar = Sidebar.useSidebar();

	async function handleNewThread() {
		// Close only once creation has actually succeeded. On mobile this panel *is* the Sheet,
		// so closing first and failing afterwards would hide the resulting `error` behind a shut
		// drawer and leave the user on the old conversation with no feedback at all. A caller
		// that can't fail returns undefined, which counts as success.
		const created = await onNewThread();
		if (created !== false) sidebar.setOpenMobile(false);
	}
</script>

<Sidebar.Root
	collapsible="offcanvas"
	mobileTitle={l.mobileTitle}
	mobileDescription={l.mobileDescription}
>
	<Sidebar.Header>
		<Button
			type="button"
			onclick={handleNewThread}
			disabled={disabled || busy}
			class="w-full justify-start gap-2"
		>
			<Plus />
			{l.newChat}
		</Button>
		{#if error}
			<div role="alert" class="text-destructive p-2 text-sm">
				{error}
			</div>
		{/if}
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>{l.threadsLabel}</Sidebar.GroupLabel>
			{#if list.error && list.threads.length === 0}
				<div role="alert" class="text-sidebar-foreground/70 flex flex-col gap-2 p-2 text-sm">
					<p>{l.error}</p>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						class="w-fit"
						disabled={list.loading}
						aria-busy={list.loading}
						onclick={() => list.retry()}
					>
						{l.retry}
					</Button>
				</div>
			{:else if list.loading && list.threads.length === 0}
				<span class="sr-only">{l.loading}</span>
				<Sidebar.Menu>
					{#each Array.from({ length: SKELETON_COUNT }, (_, i) => i) as i (i)}
						<Sidebar.MenuItem>
							<Sidebar.MenuSkeleton />
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			{:else if list.threads.length === 0}
				<p class="text-sidebar-foreground/70 p-2 text-sm">{l.empty}</p>
			{:else}
				<Sidebar.Menu>
					{#each list.threads as t (t.id)}
						{#if item}
							{@render item(t)}
						{:else}
							<ThreadListItem
								thread={t}
								isActive={t.id === activeThreadId}
								isPending={t.id === pendingThreadId}
								href={hrefFor?.(t)}
								{onSelect}
							/>
						{/if}
					{/each}
				</Sidebar.Menu>
				{#if list.error}
					<div role="alert" class="text-destructive flex flex-col gap-2 p-2 text-sm">
						<p>{l.error}</p>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							class="w-fit"
							disabled={list.loading}
							aria-busy={list.loading}
							onclick={() => list.retry()}
						>
							{l.retry}
						</Button>
					</div>
				{:else if list.hasMore}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="w-full"
						disabled={list.loading}
						aria-busy={list.loading}
						onclick={() => list.loadMore()}
					>
						{l.loadMore}
					</Button>
				{/if}
			{/if}
		</Sidebar.Group>
	</Sidebar.Content>
</Sidebar.Root>
