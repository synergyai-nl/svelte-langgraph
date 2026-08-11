<script lang="ts" module>
	export interface ChatThreadsLabels {
		newChat: string;
		threadsLabel: string;
		empty: string;
		loading: string;
		error: string;
		retry: string;
		loadMore: string;
	}

	export const defaultChatThreadsLabels: ChatThreadsLabels = {
		newChat: 'New chat',
		threadsLabel: 'Conversations',
		empty: 'No conversations yet',
		loading: 'Loading conversations',
		error: "Couldn't load your conversations.",
		retry: 'Try again',
		loadMore: 'Load more'
	};

	/** Fixed number of skeleton rows shown while the first page is loading. Not configurable. */
	const SKELETON_COUNT = 5;
</script>

<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ChatThreadItem from './ChatThreadItem.svelte';
	import type { ThreadSummary } from '$lib/langgraph/threadList';
	import type { ThreadList } from '$lib/langgraph/threadList.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		/** The reactive thread list instance, consumed whole. */
		list: ThreadList;
		activeThreadId?: string | null;
		onNewThread: () => void;
		/** Thread creation in flight; disables the "New chat" button alongside `disabled`. */
		busy?: boolean;
		/** No client / signed out; disables the "New chat" button. */
		disabled?: boolean;
		/** When given, rows render as real `<a href>`s instead of `<button>`s. */
		hrefFor?: (t: ThreadSummary) => string;
		/** Side-effect only; the mobile drawer close is handled internally. */
		onSelect?: (id: string) => void;
		/** Per-row override; when given, replaces the default row content. */
		item?: Snippet<[ThreadSummary]>;
		labels?: Partial<ChatThreadsLabels>;
	}

	let {
		list,
		activeThreadId = null,
		onNewThread,
		busy = false,
		disabled = false,
		hrefFor,
		onSelect,
		item,
		labels
	}: Props = $props();

	const l = $derived({ ...defaultChatThreadsLabels, ...labels });
</script>

<Sidebar.Root collapsible="offcanvas">
	<Sidebar.Header>
		<Button
			type="button"
			onclick={onNewThread}
			disabled={disabled || busy}
			class="w-full justify-start gap-2"
		>
			<Plus />
			{l.newChat}
		</Button>
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>{l.threadsLabel}</Sidebar.GroupLabel>
			{#if list.error}
				<div role="alert" class="text-sidebar-foreground/70 flex flex-col gap-2 p-2 text-sm">
					<p>{l.error}</p>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						class="w-fit"
						onclick={() => list.refresh()}
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
							<ChatThreadItem
								thread={t}
								isActive={t.id === activeThreadId}
								href={hrefFor?.(t)}
								{onSelect}
							/>
						{/if}
					{/each}
				</Sidebar.Menu>
				{#if list.hasMore}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="w-full"
						onclick={() => list.loadMore()}
					>
						{l.loadMore}
					</Button>
				{/if}
			{/if}
		</Sidebar.Group>
	</Sidebar.Content>
</Sidebar.Root>
