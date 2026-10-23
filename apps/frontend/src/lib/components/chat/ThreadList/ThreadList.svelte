<script lang="ts" module>
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
	import { useLangGraph } from '../langGraphContext.svelte.js';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		/**
		 * The reactive thread list instance, consumed whole. Overrides the required `<LangGraph>`
		 * context's own `threadList`.
		 */
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
		/**
		 * When given, rows render as real `<a href>`s instead of `<button>`s. Must return a
		 * resolved path (e.g. via `resolve()` from `$app/paths`): it is used as the `href` as is.
		 */
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
	}

	// `<LangGraph>` is required: this throws at init, naming `ThreadList`, outside a provider.
	const ctx = useLangGraph('ThreadList');

	// Every prop below is an override of a value the required context already provides. The
	// context-sourced fallbacks are computed via explicit `$derived`, not destructuring defaults:
	// destructuring defaults are evaluated once and would not track later changes to `ctx`'s
	// reactive fields.
	let {
		list: listProp,
		activeThreadId: activeThreadIdProp,
		pendingThreadId: pendingThreadIdProp,
		onNewThread: onNewThreadProp,
		busy: busyProp,
		disabled: disabledProp,
		hrefFor: hrefForProp,
		onSelect: onSelectProp,
		item,
		error: errorProp
	}: Props = $props();

	const list = $derived(listProp ?? ctx.threadList);
	// Explicit-`undefined` checks, not `??`: these props deliberately accept `null` as an
	// explicit "no selection"/"no pending row" override, which `??` would misread as omission
	// and fall through to the context value.
	const activeThreadId = $derived(
		activeThreadIdProp !== undefined ? activeThreadIdProp : ctx.activeThreadId
	);
	const pendingThreadId = $derived(
		pendingThreadIdProp !== undefined ? pendingThreadIdProp : ctx.pendingThreadId
	);
	const onNewThread = $derived(onNewThreadProp ?? (() => ctx.createThread()));
	const busy = $derived(busyProp ?? ctx.creatingThread);
	// "No client yet" (signed out / still resolving) disables "New chat" by default —
	// the default `onNewThread` (`ctx.createThread()`) would silently no-op without one. This
	// mirrors the old layout's explicit `disabled={!client}` wiring.
	const disabled = $derived(disabledProp ?? !ctx.client);
	const hrefFor = $derived(hrefForProp ?? ctx.hrefFor);

	// The context records the raw `Error` (useful to programmatic consumers), but the alert shows
	// the localized message — surfacing `error.message` would leak transport noise like
	// `HTTP 400: {...}` into the sidebar. Explicit-`undefined` check so `error={null}` can
	// deliberately suppress the context-defaulted alert (same rationale as `activeThreadId`).
	const error = $derived(
		errorProp !== undefined ? errorProp : ctx.createThreadError ? m.sidebar_new_chat_error() : null
	);

	// Button rows (no `hrefFor`) must still open the clicked conversation: with no explicit
	// selection wiring — the uncontrolled embed case — default the click through
	// `ctx.selectThread`. Anchor rows navigate through their own `href`, so they get no default
	// (`onSelect` there is a side-effect hook, and defaulting it would double-fire selection).
	const onSelect = $derived(
		onSelectProp ?? (hrefFor ? undefined : (id: string) => ctx.selectThread(id))
	);

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
	mobileTitle={m.sidebar_mobile_title()}
	mobileDescription={m.sidebar_mobile_description()}
>
	<Sidebar.Header>
		<Button
			type="button"
			onclick={handleNewThread}
			disabled={disabled || busy}
			class="w-full justify-start gap-2"
		>
			<Plus />
			{m.sidebar_new_chat()}
		</Button>
		{#if error}
			<div role="alert" class="text-destructive p-2 text-sm">
				{error}
			</div>
		{/if}
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>{m.sidebar_threads_label()}</Sidebar.GroupLabel>
			{#if list.error && list.threads.length === 0}
				<div role="alert" class="text-sidebar-foreground/70 flex flex-col gap-2 p-2 text-sm">
					<p>{m.sidebar_threads_error()}</p>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						class="w-fit"
						disabled={list.loading}
						aria-busy={list.loading}
						onclick={() => list.retry()}
					>
						{m.sidebar_threads_retry()}
					</Button>
				</div>
			{:else if list.loading && list.threads.length === 0}
				<span class="sr-only">{m.sidebar_threads_loading()}</span>
				<Sidebar.Menu>
					{#each Array.from({ length: SKELETON_COUNT }, (_, i) => i) as i (i)}
						<Sidebar.MenuItem>
							<Sidebar.MenuSkeleton />
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			{:else if list.threads.length === 0}
				<p class="text-sidebar-foreground/70 p-2 text-sm">{m.sidebar_threads_empty()}</p>
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
						<p>{m.sidebar_threads_error()}</p>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							class="w-fit"
							disabled={list.loading}
							aria-busy={list.loading}
							onclick={() => list.retry()}
						>
							{m.sidebar_threads_retry()}
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
						{m.sidebar_threads_load_more()}
					</Button>
				{/if}
			{/if}
		</Sidebar.Group>
	</Sidebar.Content>
</Sidebar.Root>
