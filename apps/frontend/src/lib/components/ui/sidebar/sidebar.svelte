<!-- PATCHED vs upstream registry: desktop renders in normal flex flow instead of fixed viewport positioning, so the sidebar is container-agnostic (SLG-104). -->
<!-- PATCHED vs upstream registry: the collapsed off-canvas state is inert, not just zero-width —
     upstream leaves the collapsed subtree focusable and exposed to assistive technology; only the
     visual w-0/overflow-hidden clip changes. `inert` removes it from both the tab order and the
     accessibility tree with no visual difference (SLG-104). -->
<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { SIDEBAR_WIDTH_MOBILE } from './constants.js';
	import { useSidebar } from './context.svelte.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		side = 'left',
		variant = 'sidebar',
		collapsible = 'offcanvas',
		// PATCHED vs upstream registry: upstream hard-codes the mobile Sheet's accessible
		// title/description in English; taking them as props (defaulting to the upstream
		// strings) lets callers pass localized text without importing paraglide into ui/ (SLG-104).
		mobileTitle = 'Sidebar',
		mobileDescription = 'Displays the mobile sidebar.',
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		side?: 'left' | 'right';
		variant?: 'sidebar' | 'floating' | 'inset';
		collapsible?: 'offcanvas' | 'icon' | 'none';
		mobileTitle?: string;
		mobileDescription?: string;
	} = $props();

	const sidebar = useSidebar();
</script>

{#if collapsible === 'none'}
	<div
		class={cn(
			'bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col',
			className
		)}
		bind:this={ref}
		{...restProps}
	>
		{@render children?.()}
	</div>
{:else if sidebar.isMobile}
	<Sheet.Root bind:open={() => sidebar.openMobile, (v) => sidebar.setOpenMobile(v)} {...restProps}>
		<Sheet.Content
			bind:ref
			data-sidebar="sidebar"
			data-slot="sidebar"
			data-mobile="true"
			class={cn(
				'bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden',
				className
			)}
			style="--sidebar-width: {SIDEBAR_WIDTH_MOBILE};"
			{side}
		>
			<Sheet.Header class="sr-only">
				<Sheet.Title>{mobileTitle}</Sheet.Title>
				<Sheet.Description>{mobileDescription}</Sheet.Description>
			</Sheet.Header>
			<div class="flex h-full w-full flex-col">
				{@render children?.()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<div
		bind:this={ref}
		class="text-sidebar-foreground group peer hidden md:block"
		data-state={sidebar.state}
		data-collapsible={sidebar.state === 'collapsed' ? collapsible : ''}
		data-variant={variant}
		data-side={side}
		data-slot="sidebar"
		inert={sidebar.state === 'collapsed' && collapsible === 'offcanvas'}
	>
		<div
			data-slot="sidebar-container"
			class={cn(
				'bg-sidebar flex h-full w-(--sidebar-width) flex-col overflow-hidden transition-[width] duration-200 ease-linear',
				'group-data-[collapsible=offcanvas]:w-0',
				'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
				side === 'left' ? 'border-e' : 'border-s',
				className
			)}
			{...restProps}
		>
			<div
				data-sidebar="sidebar"
				data-slot="sidebar-inner"
				class="flex h-full w-(--sidebar-width) flex-col"
			>
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
