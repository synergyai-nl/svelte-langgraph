<script lang="ts">
	/**
	 * The thread list's own sidebar shell, in place of `Sidebar.Root`, so the chat works against
	 * a consumer's stock shadcn-svelte sidebar. It reads the caller's `Sidebar.Provider` through
	 * `useSidebar()` and fills its parts (`Sidebar.Header`, `Sidebar.Content`, ...) unchanged.
	 *
	 * Differs from stock `Sidebar.Root` (`collapsible="offcanvas"`, `side="left"`,
	 * `variant="sidebar"`, all fixed here):
	 * - Desktop renders in normal flex flow, not as a fixed `h-svh` viewport panel, so the list
	 *   fits any container (a page layout, a card).
	 * - Collapsed is `inert`, not just zero-width, so the hidden rows leave the tab order and the
	 *   accessibility tree.
	 * - The mobile drawer's sr-only title and description are props, for localised text.
	 */
	import * as Sheet from '$lib/components/ui/sheet';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { SIDEBAR_WIDTH_MOBILE } from '$lib/components/ui/sidebar/constants.js';
	import type { Snippet } from 'svelte';

	interface Props {
		/** The mobile drawer's accessible (sr-only) title. */
		title: string;
		/** The mobile drawer's accessible (sr-only) description. */
		description: string;
		children: Snippet;
	}

	let { title, description, children }: Props = $props();

	const sidebar = useSidebar();
	if (!sidebar) {
		throw new Error('<ThreadList> must be rendered inside <Sidebar.Provider>');
	}

	const collapsed = $derived(sidebar.state === 'collapsed');
</script>

{#if sidebar.isMobile}
	<Sheet.Root bind:open={() => sidebar.openMobile, (v) => sidebar.setOpenMobile(v)}>
		<Sheet.Content
			data-sidebar="sidebar"
			data-slot="sidebar"
			data-mobile="true"
			class="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
			style="--sidebar-width: {SIDEBAR_WIDTH_MOBILE};"
			side="left"
		>
			<Sheet.Header class="sr-only">
				<Sheet.Title>{title}</Sheet.Title>
				<Sheet.Description>{description}</Sheet.Description>
			</Sheet.Header>
			<div class="flex h-full w-full flex-col">
				{@render children()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<div
		class="text-sidebar-foreground group peer hidden md:block"
		data-slot="sidebar"
		data-state={sidebar.state}
		data-collapsible={collapsed ? 'offcanvas' : ''}
		data-variant="sidebar"
		data-side="left"
		inert={collapsed}
	>
		<div
			data-slot="sidebar-container"
			class="bg-sidebar flex h-full w-(--sidebar-width) flex-col overflow-hidden border-e transition-[width] duration-200 ease-linear group-data-[collapsible=offcanvas]:w-0"
		>
			<div
				data-sidebar="sidebar"
				data-slot="sidebar-inner"
				class="flex h-full w-(--sidebar-width) flex-col"
			>
				{@render children()}
			</div>
		</div>
	</div>
{/if}
