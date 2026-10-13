<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { m } from '$lib/paraglide/messages.js';

	type AvailableDemo = {
		status: 'available';
		title: string;
		description: string;
		href: string;
	};

	type ComingSoonDemo = {
		status: 'coming-soon';
		title: string;
		description: string;
		href?: never;
	};

	type Demo = AvailableDemo | ComingSoonDemo;

	const availableDemos = [
		{
			status: 'available',
			title: m.demo_full_page_title(),
			description: m.demo_full_page_description(),
			href: '/chat'
		},
		{
			status: 'available',
			title: m.demo_embedded_title(),
			description: m.demo_embedded_description(),
			href: '/demo/embedded'
		}
	] satisfies Demo[];

	const comingSoonDemos = [
		{
			status: 'coming-soon',
			title: m.demo_overlay_title(),
			description: m.demo_overlay_description()
		},
		{
			status: 'coming-soon',
			title: m.demo_popup_title(),
			description: m.demo_popup_description()
		},
		{
			status: 'coming-soon',
			title: m.demo_iframe_title(),
			description: m.demo_iframe_description()
		}
	] satisfies Demo[];
</script>

<svelte:head>
	<title>{m.demo_page_title()}</title>
</svelte:head>

<div class="relative overflow-hidden">
	<div
		class="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_65%_55%_at_50%_0%,hsl(var(--accent)/0.5),transparent)]"
		aria-hidden="true"
	></div>

	<div class="relative mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
		<header class="max-w-3xl">
			<p class="text-primary-600 mb-4 text-sm font-semibold tracking-widest uppercase">
				{m.nav_demos()}
			</p>
			<h1 class="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
				{m.demo_heading()}
			</h1>
			<p class="text-foreground/70 mt-5 text-lg leading-relaxed sm:text-xl">
				{m.demo_intro()}
			</p>
		</header>

		<section class="mt-14" aria-labelledby="available-demos-heading">
			<h2 id="available-demos-heading" class="text-2xl font-semibold tracking-tight">
				{m.demo_available_now()}
			</h2>
			<div class="mt-6 grid gap-6 md:grid-cols-2">
				{#each availableDemos as demo (demo.title)}
					<Card.Root class="border-primary-600/20 bg-card/80 justify-between p-7 shadow-md">
						<div>
							<div class="mb-5 flex items-start justify-between gap-4">
								<h3 class="text-xl font-semibold">{demo.title}</h3>
								<Badge class="shrink-0">{m.demo_status_available()}</Badge>
							</div>
							<Card.Description class="text-foreground/70 text-base leading-relaxed">
								{demo.description}
							</Card.Description>
						</div>
						<Card.Footer class="px-0 pt-2">
							<Button href={demo.href} class="gap-2">
								{m.demo_open()}
								<ArrowRight class="size-4" />
							</Button>
						</Card.Footer>
					</Card.Root>
				{/each}
			</div>
		</section>

		<section class="mt-16" aria-labelledby="coming-demos-heading">
			<h2 id="coming-demos-heading" class="text-2xl font-semibold tracking-tight">
				{m.demo_coming_next()}
			</h2>
			<div class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each comingSoonDemos as demo (demo.title)}
					<Card.Root class="bg-muted/30 gap-4 border-dashed p-6 shadow-none">
						<div class="flex items-start justify-between gap-4">
							<h3 class="text-lg font-semibold">{demo.title}</h3>
							<Badge variant="outline" class="text-foreground/70 shrink-0">
								{m.demo_status_coming_soon()}
							</Badge>
						</div>
						<Card.Description class="text-foreground/70 text-sm leading-relaxed">
							{demo.description}
						</Card.Description>
					</Card.Root>
				{/each}
			</div>
		</section>
	</div>
</div>
