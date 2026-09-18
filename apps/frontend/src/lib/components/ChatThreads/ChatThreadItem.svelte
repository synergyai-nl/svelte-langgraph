<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Spinner } from '$lib/components/ui/spinner';
	import { threadLabel, type ThreadSummary } from '$lib/langgraph/threadList';
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

<Sidebar.MenuItem>
	{#if href}
		<Sidebar.MenuButton {isActive} {isPending} aria-current={isActive ? 'page' : undefined}>
			{#snippet child({ props })}
				<a {href} {...props} onclick={handleClick}>
					<span class="truncate">{threadLabel(thread, getLocale())}</span>
					{#if isPending}
						<Spinner size="sm" aria-hidden="true" class="ml-auto shrink-0" />
					{/if}
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	{:else}
		<Sidebar.MenuButton
			type="button"
			{isActive}
			{isPending}
			aria-current={isActive ? 'page' : undefined}
			onclick={handleClick}
		>
			<span class="truncate">{threadLabel(thread, getLocale())}</span>
			{#if isPending}
				<Spinner size="sm" aria-hidden="true" class="ml-auto shrink-0" />
			{/if}
		</Sidebar.MenuButton>
	{/if}
</Sidebar.MenuItem>
