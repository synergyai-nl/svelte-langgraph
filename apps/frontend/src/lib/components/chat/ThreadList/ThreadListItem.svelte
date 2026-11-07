<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Spinner } from '$lib/components/ui/spinner';
	import { threadLabel, type ThreadSummary } from '@svelte-langgraph/client';
	// Plain read, not reactive: LanguageSwitcher's setLocale() reloads the page on change.
	import { getLocale } from '$lib/paraglide/runtime.js';

	interface Props {
		thread: ThreadSummary;
		isActive?: boolean;
		/** Row is the target of an in-flight navigation; shows a trailing spinner. */
		isPending?: boolean;
		/** When given, the row renders as a real `<a href>`; otherwise a `<button type="button">`. */
		href?: string;
		/** Side-effect only; the mobile drawer close is handled internally. */
		onSelect?: (id: string) => void;
	}

	let { thread, isActive = false, isPending = false, href, onSelect }: Props = $props();

	const sidebar = Sidebar.useSidebar();

	function handleClick() {
		sidebar.setOpenMobile(false);
		onSelect?.(thread.id);
	}
</script>

<!-- Our own element through the stock `MenuButton`'s `child` snippet, so a row can be a real
     `<a>` or a `<button type="button">` and carry `data-pending`, which stock knows nothing of.
     `data-active` is overridden to be absent unless active: stock sets `data-active="false"` on
     every inactive row, and its `data-active:` variant matches any value. The classes keep the
     lighter hover and add the pending tint; `cn()` lets them win over stock's. -->
<Sidebar.MenuItem>
	<Sidebar.MenuButton
		{isActive}
		aria-current={isActive ? 'page' : undefined}
		class="hover:bg-sidebar-accent/50 data-[pending=true]:bg-sidebar-accent/70 data-[pending=true]:text-sidebar-accent-foreground"
	>
		{#snippet child({ props })}
			{#if href}
				<a
					{href}
					{...props}
					data-active={isActive || undefined}
					data-pending={isPending}
					onclick={handleClick}
				>
					{@render label()}
				</a>
			{:else}
				<button
					type="button"
					{...props}
					data-active={isActive || undefined}
					data-pending={isPending}
					onclick={handleClick}
				>
					{@render label()}
				</button>
			{/if}
		{/snippet}
	</Sidebar.MenuButton>
</Sidebar.MenuItem>

{#snippet label()}
	<span class="truncate">{threadLabel(thread, getLocale())}</span>
	{#if isPending}
		<Spinner aria-hidden="true" />
	{/if}
{/snippet}
