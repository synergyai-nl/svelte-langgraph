<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { threadLabel, type ThreadSummary } from '$lib/langgraph/threadList';

	interface Props {
		thread: ThreadSummary;
		isActive?: boolean;
		/** When given, the row renders as a real `<a href>`; otherwise a `<button type="button">`. */
		href?: string;
		/** Side-effect only; the mobile drawer close is handled internally. */
		onSelect?: (id: string) => void;
	}

	let { thread, isActive = false, href, onSelect }: Props = $props();

	const sidebar = Sidebar.useSidebar();

	function handleClick() {
		sidebar.setOpenMobile(false);
		onSelect?.(thread.id);
	}
</script>

<Sidebar.MenuItem>
	{#if href}
		<Sidebar.MenuButton {isActive} aria-current={isActive ? 'page' : undefined}>
			{#snippet child({ props })}
				<a {href} {...props} onclick={handleClick}>
					{threadLabel(thread)}
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	{:else}
		<Sidebar.MenuButton
			type="button"
			{isActive}
			aria-current={isActive ? 'page' : undefined}
			onclick={handleClick}
		>
			{threadLabel(thread)}
		</Sidebar.MenuButton>
	{/if}
</Sidebar.MenuItem>
