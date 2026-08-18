<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import {
		Shield,
		Zap,
		Blocks,
		Key,
		Github,
		ArrowRight,
		Check,
		X,
		GitFork,
		Cpu,
		Layers,
		Headphones,
		CircleDot,
		Circle,
		ExternalLink,
		MessageSquare
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import HeroTerminal from '$lib/components/marketing/HeroTerminal.svelte';
	import LandscapeComparisonTable, {
		type ComparisonRow
	} from '$lib/components/marketing/LandscapeComparisonTable.svelte';
	import StackLogos from '$lib/components/marketing/StackLogos.svelte';

	interface Feature {
		icon: Component<{ class?: string }>;
		title: string;
		description: string;
	}

	interface Step {
		step: string;
		title: string;
		description: string;
	}

	interface RoadmapItem {
		title: string;
		description: string;
		status: 'done' | 'in-progress' | 'planned';
	}

	const features: Feature[] = [
		{
			icon: Zap,
			title: m.landing_feature_1_title(),
			description: m.landing_feature_1_description()
		},
		{
			icon: Shield,
			title: m.landing_feature_2_title(),
			description: m.landing_feature_2_description()
		},
		{
			icon: Blocks,
			title: m.landing_feature_3_title(),
			description: m.landing_feature_3_description()
		},
		{
			icon: Key,
			title: m.landing_feature_4_title(),
			description: m.landing_feature_4_description()
		}
	];

	const comparison: ComparisonRow[] = [
		{
			label: m.landing_compare_security_review(),
			svelteLanggraph: 'yes',
			langflow: 'partial',
			chainlit: 'partial',
			openWebui: 'partial',
			customReact: 'yes'
		},
		{
			label: m.landing_compare_langgraph_native(),
			svelteLanggraph: 'yes',
			langflow: 'yes',
			chainlit: 'yes',
			openWebui: 'partial',
			customReact: 'partial'
		},
		{
			label: m.landing_compare_code_quality(),
			svelteLanggraph: 'yes',
			langflow: 'partial',
			chainlit: 'partial',
			openWebui: 'partial',
			customReact: 'yes'
		},
		{
			label: m.landing_compare_security_first(),
			svelteLanggraph: 'yes',
			langflow: 'partial',
			chainlit: 'no',
			openWebui: 'partial',
			customReact: 'no'
		},
		{
			label: m.landing_compare_full_streaming(),
			svelteLanggraph: 'yes',
			langflow: 'partial',
			chainlit: 'yes',
			openWebui: 'partial',
			customReact: 'partial'
		},
		{
			label: m.landing_compare_customization(),
			svelteLanggraph: 'yes',
			langflow: 'partial',
			chainlit: 'no',
			openWebui: 'partial',
			customReact: 'yes'
		},
		{
			label: m.landing_compare_no_js_backend(),
			svelteLanggraph: 'yes',
			langflow: 'yes',
			chainlit: 'yes',
			openWebui: 'no',
			customReact: 'no'
		},
		{
			label: m.landing_compare_community(),
			svelteLanggraph: 'no',
			langflow: 'yes',
			chainlit: 'yes',
			openWebui: 'yes',
			customReact: 'yes'
		},
		{
			label: m.landing_compare_feature_surface(),
			svelteLanggraph: 'no',
			langflow: 'yes',
			chainlit: 'yes',
			openWebui: 'yes',
			customReact: 'partial'
		}
	];

	const personas: Feature[] = [
		{
			icon: Cpu,
			title: m.landing_persona_1_title(),
			description: m.landing_persona_1_description()
		},
		{
			icon: GitFork,
			title: m.landing_persona_2_title(),
			description: m.landing_persona_2_description()
		},
		{
			icon: Layers,
			title: m.landing_persona_3_title(),
			description: m.landing_persona_3_description()
		},
		{
			icon: Headphones,
			title: m.landing_persona_4_title(),
			description: m.landing_persona_4_description()
		}
	];

	const steps: Step[] = [
		{ step: '01', title: m.landing_step_1_title(), description: m.landing_step_1_description() },
		{ step: '02', title: m.landing_step_2_title(), description: m.landing_step_2_description() },
		{ step: '03', title: m.landing_step_3_title(), description: m.landing_step_3_description() }
	];

	const roadmap: RoadmapItem[] = [
		{
			title: m.landing_roadmap_1_title(),
			description: m.landing_roadmap_1_description(),
			status: 'done'
		},
		{
			title: m.landing_roadmap_2_title(),
			description: m.landing_roadmap_2_description(),
			status: 'done'
		},
		{
			title: m.landing_roadmap_3_title(),
			description: m.landing_roadmap_3_description(),
			status: 'done'
		},
		{
			title: m.landing_roadmap_4_title(),
			description: m.landing_roadmap_4_description(),
			status: 'done'
		},
		{
			title: m.landing_roadmap_5_title(),
			description: m.landing_roadmap_5_description(),
			status: 'in-progress'
		},
		{
			title: m.landing_roadmap_6_title(),
			description: m.landing_roadmap_6_description(),
			status: 'in-progress'
		},
		{
			title: m.landing_roadmap_7_title(),
			description: m.landing_roadmap_7_description(),
			status: 'planned'
		},
		{
			title: m.landing_roadmap_8_title(),
			description: m.landing_roadmap_8_description(),
			status: 'planned'
		},
		{
			title: m.landing_roadmap_9_title(),
			description: m.landing_roadmap_9_description(),
			status: 'planned'
		},
		{
			title: m.landing_roadmap_10_title(),
			description: m.landing_roadmap_10_description(),
			status: 'planned'
		}
	];

	const GITHUB_URL = 'https://github.com/synergyai-nl/svelte-langgraph';
	const DEMO_URL = 'https://svelte-langgraph-demo.synergyai.nl/';
	const DOCS_URL = `${GITHUB_URL}#readme`;

	const ecosystemLinks = [
		{ name: 'Chainlit', href: 'https://chainlit.io' },
		{ name: 'Langflow', href: 'https://www.langflow.org' },
		{ name: 'Streamlit', href: 'https://streamlit.io' },
		{ name: 'Open WebUI', href: 'https://openwebui.com' }
	] as const;
</script>

<div class="overflow-hidden">
	<!-- ── Hero ─────────────────────────────────────────────────────────────── -->
	<section class="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
		<div
			class="absolute inset-0 [background-image:linear-gradient(hsl(var(--border-card))_1px,transparent_1px),linear-gradient(to_right,hsl(var(--border-card))_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black_50%,transparent)] [background-size:4rem_4rem] opacity-[0.15]"
		></div>

		<div
			class="animate-glow-pulse from-primary-600/15 via-primary-400/5 absolute -top-[40%] left-1/2 h-[80%] w-[140%] -translate-x-1/2 rounded-full bg-gradient-to-b to-transparent blur-3xl"
		></div>
		<div
			class="animate-glow-pulse from-secondary-600/10 absolute -right-[10%] bottom-0 h-[50%] w-[50%] rounded-full bg-gradient-to-tl to-transparent blur-3xl [animation-delay:2s]"
		></div>

		<div class="relative mx-auto max-w-7xl px-6 py-10 md:py-14 lg:py-16">
			<div
				class="grid items-start gap-10 md:gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16"
			>
				<div class="flex flex-col gap-8 text-center lg:gap-8 lg:text-left">
					<div class="flex flex-col gap-3 lg:gap-4">
						<h1
							class="animate-fade-in-up-delay-1 text-4xl leading-[1.08] font-bold tracking-tight sm:text-5xl lg:text-6xl lg:text-wrap"
						>
							{m.landing_hero_title_line1()}<br />
							<span
								class="from-primary-600 to-primary-400 bg-gradient-to-r bg-clip-text text-transparent"
								>{m.landing_hero_title_line2()}</span
							>
						</h1>

						<p
							class="animate-fade-in-up-delay-2 text-muted-foreground text-lg leading-relaxed lg:max-w-xl lg:text-xl lg:leading-relaxed"
						>
							{m.landing_hero_subtitle()}
						</p>
					</div>

					<div class="animate-fade-in-up-delay-3 flex flex-col gap-4">
						<div
							class="flex flex-col items-center justify-center gap-3 sm:flex-row lg:items-start lg:justify-start"
						>
							<Button
								href="/chat"
								size="lg"
								class="shadow-primary-600/20 w-full cursor-pointer gap-2 px-8 text-base shadow-lg sm:w-auto"
							>
								<MessageSquare class="size-4" />
								{m.landing_cta_open_chat()}
								<ArrowRight class="size-4" />
							</Button>
							<Button
								href={DEMO_URL}
								target="_blank"
								rel="noopener noreferrer"
								size="lg"
								variant="outline"
								class="w-full cursor-pointer gap-2 px-8 text-base sm:w-auto"
							>
								{m.landing_cta_live_demo()}
								<ExternalLink class="size-4" />
							</Button>
							<Button
								href={GITHUB_URL}
								target="_blank"
								rel="noopener noreferrer"
								size="lg"
								variant="ghost"
								class="w-full cursor-pointer gap-2 px-8 text-base sm:w-auto"
							>
								<Github class="size-5" />
								{m.landing_cta_view_github()}
							</Button>
						</div>
						<p class="text-muted-foreground text-sm">
							{m.landing_hero_note()}
							<a
								href={DOCS_URL}
								target="_blank"
								rel="noopener noreferrer"
								class="text-foreground/80 hover:text-foreground ml-1 inline-flex items-center gap-1 underline-offset-4 transition-colors hover:underline"
							>
								{m.landing_cta_read_docs()}
								<ExternalLink class="size-3.5" />
							</a>
						</p>
					</div>
				</div>

				<div
					class="animate-fade-in-up-delay-2 relative mx-auto w-full max-w-xl lg:mx-0 lg:max-w-none"
				>
					<div
						class="from-primary-600/20 pointer-events-none absolute -inset-6 rounded-3xl bg-gradient-to-br to-transparent opacity-60 blur-2xl"
						aria-hidden="true"
					></div>
					<HeroTerminal class="relative" />
				</div>
			</div>
		</div>

		<StackLogos />
	</section>

	<!-- ── Value proposition ─────────────────────────────────────────────────── -->
	<section class="py-24">
		<div class="mx-auto max-w-7xl px-6">
			<div class="grid items-center gap-16 md:grid-cols-2">
				<div>
					<p class="text-primary-600 mb-4 text-sm font-semibold tracking-widest uppercase">
						{m.landing_gap_eyebrow()}
					</p>
					<h2 class="mb-6 text-4xl font-bold tracking-tight text-balance">
						{m.landing_gap_title_line1()}<br />
						<span class="text-muted-foreground/70">{m.landing_gap_title_line2()}</span>
					</h2>
					<p class="text-muted-foreground text-lg leading-relaxed">
						{m.landing_gap_body()}
					</p>
				</div>
				<div class="space-y-4">
					{#each [m.landing_pain_1(), m.landing_pain_2(), m.landing_pain_3(), m.landing_pain_4(), m.landing_pain_5()] as pain (pain)}
						<div
							class="border-destructive/15 bg-destructive/5 hover:border-destructive/25 flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors"
						>
							<X class="text-destructive/70 mt-0.5 size-4 shrink-0" />
							<span class="text-muted-foreground text-sm">{pain}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- ── Features ──────────────────────────────────────────────────────────── -->
	<section class="relative py-24">
		<div class="from-muted/30 via-muted/10 absolute inset-0 bg-gradient-to-b to-transparent"></div>
		<div class="relative mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<p class="text-primary-600 mb-4 text-sm font-semibold tracking-widest uppercase">
					{m.landing_features_eyebrow()}
				</p>
				<h2 class="text-4xl font-bold tracking-tight">
					{m.landing_features_title_line1()}<br />
					<span class="text-muted-foreground/60">{m.landing_features_title_line2()}</span>
				</h2>
				<p class="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
					{m.landing_features_subtitle()}
				</p>
			</div>

			<div class="grid gap-6 sm:grid-cols-2">
				{#each features as feature (feature.title)}
					{@const Icon = feature.icon}
					<Card.Root
						class="group bg-card/50 hover:shadow-primary-600/5 relative border p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
					>
						<div
							class="from-primary-600/5 absolute inset-0 rounded-[inherit] bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
						></div>
						<div class="relative">
							<div
								class="bg-primary-600/10 group-hover:bg-primary-600/15 mb-4 flex size-12 items-center justify-center rounded-xl transition-colors"
							>
								<Icon class="text-primary-600 size-6" />
							</div>
							<h3 class="mb-2 text-lg font-semibold">{feature.title}</h3>
							<p class="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
						</div>
					</Card.Root>
				{/each}
			</div>
			<p class="text-muted-foreground mt-10 text-center text-sm">
				{m.landing_features_footnote()}
			</p>
		</div>
	</section>

	<!-- ── Getting started ──────────────────────────────────────────────────── -->
	<section class="py-24">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<p class="text-primary-600 mb-4 text-sm font-semibold tracking-widest uppercase">
					{m.landing_steps_eyebrow()}
				</p>
				<h2 class="text-4xl font-bold tracking-tight">{m.landing_steps_title()}</h2>
				<p class="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
					{m.landing_steps_subtitle()}
				</p>
			</div>

			<div class="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
				{#each steps as step (step.step)}
					<div class="group text-center">
						<div
							class="text-primary-600/15 group-hover:text-primary-600/30 mb-4 font-mono text-6xl font-bold transition-colors"
						>
							{step.step}
						</div>
						<h3 class="mb-3 text-xl font-semibold">{step.title}</h3>
						<p class="text-muted-foreground">{step.description}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ── Who it's for ──────────────────────────────────────────────────────── -->
	<section class="relative py-24">
		<div class="from-muted/30 via-muted/10 absolute inset-0 bg-gradient-to-b to-transparent"></div>
		<div class="relative mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<p class="text-primary-600 mb-4 text-sm font-semibold tracking-widest uppercase">
					{m.landing_personas_eyebrow()}
				</p>
				<h2 class="text-4xl font-bold tracking-tight">{m.landing_personas_title()}</h2>
			</div>

			<div class="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
				{#each personas as persona (persona.title)}
					{@const Icon = persona.icon}
					<div
						class="group bg-card/50 hover:shadow-primary-600/5 rounded-xl border p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
					>
						<div
							class="bg-primary-600/10 group-hover:bg-primary-600/15 mb-4 flex size-10 items-center justify-center rounded-lg transition-colors"
						>
							<Icon class="text-primary-600 size-5" />
						</div>
						<h3 class="mb-3 text-lg font-semibold">{persona.title}</h3>
						<p class="text-muted-foreground text-sm leading-relaxed">{persona.description}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ── Landscape ─────────────────────────────────────────────────────────── -->
	<section class="py-24">
		<div class="mx-auto max-w-5xl px-6">
			<div class="mb-16 text-center">
				<p class="text-primary-600 mb-4 text-sm font-semibold tracking-widest uppercase">
					{m.landing_landscape_eyebrow()}
				</p>
				<h2 class="mb-4 text-4xl font-bold tracking-tight">{m.landing_landscape_title()}</h2>
				<p class="text-muted-foreground mx-auto max-w-2xl text-lg">
					{m.landing_landscape_subtitle()}
				</p>
			</div>

			<LandscapeComparisonTable rows={comparison} />

			<p class="text-muted-foreground mt-6 text-center text-sm">
				{m.landing_landscape_note()}
			</p>

			<div class="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
				{#each ecosystemLinks as link (link.name)}
					<a
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
						class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
					>
						{link.name}
						<ExternalLink class="size-3.5 shrink-0 opacity-60" />
					</a>
				{/each}
			</div>
			<p class="text-muted-foreground/80 mt-4 text-center text-xs">
				{m.landing_landscape_streamlit_note()}
			</p>
		</div>
	</section>

	<!-- ── Roadmap ───────────────────────────────────────────────────────────── -->
	<section class="relative py-24">
		<div class="from-muted/30 via-muted/10 absolute inset-0 bg-gradient-to-b to-transparent"></div>
		<div class="relative mx-auto max-w-3xl px-6">
			<div class="mb-16 text-center">
				<p class="text-primary-600 mb-4 text-sm font-semibold tracking-widest uppercase">
					{m.landing_roadmap_eyebrow()}
				</p>
				<h2 class="mb-4 text-4xl font-bold tracking-tight">{m.landing_roadmap_title()}</h2>
				<p class="text-muted-foreground mx-auto max-w-xl text-lg">
					{m.landing_roadmap_subtitle()}
				</p>
			</div>

			<div class="relative space-y-0">
				<!-- Timeline line -->
				<div
					class="via-primary-500/40 to-muted-foreground/20 absolute top-2 bottom-2 left-[19px] w-px bg-gradient-to-b from-green-500/40"
				></div>

				{#each roadmap as item (item.title)}
					{@const isDone = item.status === 'done'}
					{@const isActive = item.status === 'in-progress'}
					<div class="relative flex gap-4 py-3">
						<!-- Status dot -->
						<div class="relative z-10 flex size-10 shrink-0 items-center justify-center">
							{#if isDone}
								<div class="flex size-7 items-center justify-center rounded-full bg-green-500/15">
									<Check class="size-4 text-green-500" />
								</div>
							{:else if isActive}
								<div class="bg-primary-600/15 flex size-7 items-center justify-center rounded-full">
									<CircleDot class="text-primary-600 size-4 motion-safe:animate-pulse" />
								</div>
							{:else}
								<div class="bg-muted flex size-7 items-center justify-center rounded-full">
									<Circle class="text-muted-foreground/40 size-4" />
								</div>
							{/if}
						</div>
						<!-- Content -->
						<div class="flex-1 pb-1">
							<div class="flex items-center gap-3">
								<h3
									class="font-semibold {isDone
										? 'text-foreground'
										: isActive
											? 'text-primary-600'
											: 'text-muted-foreground/70'}"
								>
									{item.title}
								</h3>
								{#if isDone}
									<Badge
										variant="outline"
										class="border-green-600/30 bg-green-500/5 text-xs text-green-600"
										>{m.landing_roadmap_status_shipped()}</Badge
									>
								{:else if isActive}
									<Badge
										variant="outline"
										class="text-primary-600 border-primary-600/30 bg-primary-600/5 text-xs"
										>{m.landing_roadmap_status_in_progress()}</Badge
									>
								{:else}
									<Badge variant="outline" class="text-muted-foreground/60 text-xs"
										>{m.landing_roadmap_status_planned()}</Badge
									>
								{/if}
							</div>
							<p class="text-muted-foreground mt-1 text-sm">{item.description}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ── Built in the open ─────────────────────────────────────────────────── -->
	<section class="py-24">
		<div class="mx-auto max-w-4xl px-6 text-center">
			<p class="text-primary-600 mb-4 text-sm font-semibold tracking-widest uppercase">
				{m.landing_open_eyebrow()}
			</p>
			<h2 class="mb-4 text-4xl font-bold tracking-tight">{m.landing_open_title()}</h2>
			<p class="text-muted-foreground mx-auto mb-8 max-w-2xl text-lg leading-relaxed">
				{m.landing_open_body()}
			</p>
			<div class="flex flex-col justify-center gap-4 sm:flex-row">
				<Button
					href={GITHUB_URL}
					target="_blank"
					rel="noopener noreferrer"
					size="lg"
					variant="outline"
					class="cursor-pointer gap-2 px-8 text-base"
				>
					<Github class="size-5" />
					{m.landing_cta_star_github()}
				</Button>
				<Button
					href={`${GITHUB_URL}/issues`}
					target="_blank"
					rel="noopener noreferrer"
					size="lg"
					variant="ghost"
					class="cursor-pointer gap-2 px-8 text-base"
				>
					{m.landing_cta_open_issue()}
					<ExternalLink class="size-4" />
				</Button>
			</div>
		</div>
	</section>

	<!-- ── Final CTA ─────────────────────────────────────────────────────────── -->
	<section class="relative py-28">
		<div
			class="animate-glow-pulse absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_50%,hsl(var(--accent)/0.15),transparent)]"
		></div>
		<div class="relative mx-auto max-w-4xl px-6 text-center">
			<h2 class="mb-6 text-5xl leading-tight font-bold tracking-tight text-balance sm:text-6xl">
				{m.landing_final_title_line1()}<br />
				<span class="from-primary-600 to-primary-400 bg-gradient-to-r bg-clip-text text-transparent"
					>{m.landing_final_title_line2()}</span
				>
			</h2>
			<p class="text-muted-foreground mx-auto mb-10 max-w-2xl text-xl">
				{m.landing_final_body()}
			</p>
			<div class="flex flex-col justify-center gap-4 sm:flex-row">
				<Button
					href={DEMO_URL}
					target="_blank"
					rel="noopener noreferrer"
					size="lg"
					class="shadow-primary-600/20 cursor-pointer gap-2 px-8 text-base shadow-lg"
				>
					{m.landing_cta_live_demo()}
					<ArrowRight class="size-4" />
				</Button>
				<Button
					href={GITHUB_URL}
					target="_blank"
					rel="noopener noreferrer"
					size="lg"
					variant="outline"
					class="cursor-pointer gap-2 px-8 text-base"
				>
					<Github class="size-5" />
					{m.landing_cta_view_github()}
				</Button>
				<Button
					href={DOCS_URL}
					target="_blank"
					rel="noopener noreferrer"
					size="lg"
					variant="ghost"
					class="cursor-pointer gap-2 px-8 text-base"
				>
					{m.landing_cta_read_docs()}
					<ExternalLink class="size-4" />
				</Button>
			</div>
		</div>
	</section>

	<!-- ── Footer ────────────────────────────────────────────────────────────── -->
	<footer class="border-t py-10">
		<div class="mx-auto max-w-7xl px-6">
			<div class="flex flex-col items-center justify-between gap-6 sm:flex-row">
				<div class="flex items-center gap-3">
					<!-- svelte mini logo -->
					<svg class="h-4 w-4 opacity-40" viewBox="0 0 98.1 118" xmlns="http://www.w3.org/2000/svg">
						<path
							d="M91.8 15.6C80.9-.1 59.2-4.7 43.6 5.2L16.1 22.8C8.6 27.5 3.4 35.2 1.9 43.9c-1.3 7.3-.2 14.8 3.3 21.3-2.4 3.6-4 7.6-4.7 11.8-1.6 8.9.5 18.1 5.7 25.4 11 15.7 32.6 20.3 48.2 10.4l27.5-17.6c7.5-4.7 12.7-12.4 14.2-21.1 1.3-7.3.2-14.8-3.3-21.3 2.4-3.6 4-7.6 4.7-11.8 1.7-9-.4-18.2-5.7-25.4"
							fill="currentColor"
						/>
					</svg>
					<span class="text-muted-foreground text-xs">{m.landing_footer_credits()}</span>
				</div>
				<div class="flex items-center gap-4">
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						class="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
					>
						<Github class="size-3.5" />
						GitHub
					</a>
					<Separator orientation="vertical" class="h-4" />
					<a
						href="https://www.synergyai.nl/"
						target="_blank"
						rel="noopener noreferrer"
						class="transition-opacity hover:opacity-80"
					>
						<img
							src="https://assets.lightfunnels.com/cdn-cgi/image/width=3840,quality=60,format=auto/https://assets.lightfunnels.com/account-20917/images_library/c12b9172-6242-4fb7-aa55-cc1ceec720fa.Logo%20SynergyAI.png"
							alt="SynergyAI"
							class="h-5 w-auto"
						/>
					</a>
				</div>
			</div>
		</div>
	</footer>
</div>
