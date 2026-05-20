<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import {
		Shield,
		Zap,
		Blocks,
		Key,
		Clock,
		Code2,
		Github,
		ArrowRight,
		Check,
		X,
		Minus,
		Terminal,
		GitFork,
		Cpu,
		Layers,
		Rocket,
		CircleDot,
		Circle,
		ExternalLink
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

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

	interface ComparisonRow {
		label: string;
		svelteLanggraph: 'yes' | 'no' | 'partial';
		chainlit: 'yes' | 'no' | 'partial';
		openWebui: 'yes' | 'no' | 'partial';
		customReact: 'yes' | 'no' | 'partial';
	}

	interface RoadmapItem {
		title: string;
		description: string;
		status: 'done' | 'in-progress' | 'planned';
	}

	const features: Feature[] = [
		{
			icon: Shield,
			title: 'Security-First',
			description:
				'OIDC authentication built in. Every line is intentionally reviewable — no black-box codebases that pass audits on vibes alone.'
		},
		{
			icon: Zap,
			title: 'LangGraph Native',
			description:
				'Connects directly to your LangGraph server. No TypeScript backend required. Full streaming for tools, sub-agents, and complex agentic workflows.'
		},
		{
			icon: Blocks,
			title: 'Fully Customizable',
			description:
				'Every component layer is independently configurable. Built on bits-ui and shadcn-svelte — override anything, extend everything.'
		},
		{
			icon: Key,
			title: 'OpenAI Compatible',
			description:
				"Works with any model LangChain's ChatModel supports. Anthropic, OpenAI, local models, Azure — if it speaks the protocol, it works."
		},
		{
			icon: Clock,
			title: 'Built for Longevity',
			description:
				'We maintain what we ship. Intentional dependency management and security patches so what you build today still runs tomorrow.'
		},
		{
			icon: Code2,
			title: 'Svelte-Powered',
			description:
				"Svelte's component model gives you per-layer control without React overhead. Smaller bundles. Faster renders. Easier customization."
		}
	] as const;

	const comparison: ComparisonRow[] = [
		{
			label: 'LangGraph / Python native',
			svelteLanggraph: 'yes',
			chainlit: 'yes',
			openWebui: 'partial',
			customReact: 'partial'
		},
		{
			label: 'Code quality & auditability',
			svelteLanggraph: 'yes',
			chainlit: 'partial',
			openWebui: 'partial',
			customReact: 'yes'
		},
		{
			label: 'Security-first (OIDC built in)',
			svelteLanggraph: 'yes',
			chainlit: 'no',
			openWebui: 'partial',
			customReact: 'no'
		},
		{
			label: 'Full streaming (tools + sub-agents)',
			svelteLanggraph: 'yes',
			chainlit: 'yes',
			openWebui: 'partial',
			customReact: 'partial'
		},
		{
			label: 'Per-component customization',
			svelteLanggraph: 'yes',
			chainlit: 'no',
			openWebui: 'partial',
			customReact: 'yes'
		},
		{
			label: 'No JS backend required',
			svelteLanggraph: 'yes',
			chainlit: 'yes',
			openWebui: 'no',
			customReact: 'no'
		},
		{
			label: 'Active large community',
			svelteLanggraph: 'no',
			chainlit: 'yes',
			openWebui: 'yes',
			customReact: 'yes'
		},
		{
			label: 'Broad feature surface',
			svelteLanggraph: 'no',
			chainlit: 'yes',
			openWebui: 'yes',
			customReact: 'partial'
		}
	];

	const personas: Feature[] = [
		{
			icon: Cpu,
			title: 'Python AI developers',
			description:
				"You've built a solid LangGraph agent. You need a frontend that connects cleanly without forcing you into a TypeScript-heavy stack."
		},
		{
			icon: GitFork,
			title: 'Boutique AI agencies',
			description:
				"You're building custom AI apps for clients. You need something you can customize, maintain, and hand over with confidence."
		},
		{
			icon: Layers,
			title: 'SaaS platform teams',
			description:
				"You're embedding agent chat into an existing product. You need an auditable, secure component you can trust for the long haul."
		}
	];

	const steps: Step[] = [
		{
			step: '01',
			title: 'Fork & configure',
			description:
				'Fork the repo. Copy .env.example. Point it at your LangGraph endpoint and OIDC provider. Done in under 5 minutes.'
		},
		{
			step: '02',
			title: 'Run dev',
			description:
				'moon :dev starts frontend, backend, and OIDC mock together — everything hot-reloads. No tab juggling.'
		},
		{
			step: '03',
			title: 'Ship it',
			description:
				'Deploy with the included config. Pull upstream security patches. Stay current without the rewrite treadmill.'
		}
	];

	const roadmap: RoadmapItem[] = [
		{
			title: 'Core chat UI with streaming',
			description: 'Full message streaming, tool calls, and sub-agent visualization',
			status: 'done'
		},
		{
			title: 'OIDC authentication',
			description: 'Secure login with any OpenID Connect provider',
			status: 'done'
		},
		{
			title: 'Dark mode & theming',
			description: 'Complete design system with light/dark mode and Tailwind CSS tokens',
			status: 'done'
		},
		{
			title: 'Multi-language support',
			description: 'i18n with Paraglide — English, Dutch, and Hindi included',
			status: 'done'
		},
		{
			title: 'Conversation history',
			description: 'Persistent threads backed by LangGraph checkpoints',
			status: 'in-progress'
		},
		{
			title: 'File upload & attachments',
			description: 'Send images, PDFs, and documents to your agent',
			status: 'in-progress'
		},
		{
			title: 'Plugin system',
			description: 'Drop-in extensions for custom tool renderers, message types, and layouts',
			status: 'planned'
		},
		{
			title: 'Installable package (no fork required)',
			description: 'Use svelte-langgraph as a dependency — npm install and go',
			status: 'planned'
		},
		{
			title: 'Admin dashboard',
			description: 'Monitor agents, view usage, and manage users from a built-in admin panel',
			status: 'planned'
		}
	];

	const GITHUB_URL = 'https://github.com/synergyai-nl/svelte-langgraph';

	type CellStatus = 'yes' | 'no' | 'partial';

	function getRowCells(row: ComparisonRow): CellStatus[] {
		return [row.svelteLanggraph, row.chainlit, row.openWebui, row.customReact];
	}

	function statusIcon(status: CellStatus) {
		if (status === 'yes') return Check;
		if (status === 'partial') return Minus;
		return X;
	}

	function statusColor(status: CellStatus) {
		if (status === 'yes') return 'text-green-500';
		if (status === 'partial') return 'text-yellow-500';
		return 'text-muted-foreground/30';
	}
</script>

<div class="overflow-hidden">
	<!-- ── Hero ─────────────────────────────────────────────────────────────── -->
	<section class="relative flex min-h-[calc(100vh-4rem)] flex-col justify-center overflow-hidden">
		<div
			class="absolute inset-0 opacity-[0.15] [background-image:linear-gradient(hsl(var(--border-card))_1px,transparent_1px),linear-gradient(to_right,hsl(var(--border-card))_1px,transparent_1px)] [background-size:4rem_4rem]"
		></div>

		<div
			class="animate-glow-pulse absolute -top-[40%] left-1/2 h-[80%] w-[140%] -translate-x-1/2 rounded-full bg-gradient-to-b from-primary-600/15 via-primary-400/5 to-transparent blur-3xl"
		></div>
		<div
			class="animate-glow-pulse absolute -right-[10%] bottom-0 h-[50%] w-[50%] rounded-full bg-gradient-to-tl from-secondary-600/10 to-transparent blur-3xl [animation-delay:2s]"
		></div>

		<div class="relative mx-auto max-w-7xl px-6 py-24 text-center">
			<div class="animate-fade-in-up mb-10 flex items-center justify-center gap-6">
				<!-- svelte logo -->
				<svg class="h-10 w-10 opacity-60 transition-opacity hover:opacity-100" viewBox="0 0 98.1 118" xmlns="http://www.w3.org/2000/svg">
					<path d="M91.8 15.6C80.9-.1 59.2-4.7 43.6 5.2L16.1 22.8C8.6 27.5 3.4 35.2 1.9 43.9c-1.3 7.3-.2 14.8 3.3 21.3-2.4 3.6-4 7.6-4.7 11.8-1.6 8.9.5 18.1 5.7 25.4 11 15.7 32.6 20.3 48.2 10.4l27.5-17.6c7.5-4.7 12.7-12.4 14.2-21.1 1.3-7.3.2-14.8-3.3-21.3 2.4-3.6 4-7.6 4.7-11.8 1.7-9-.4-18.2-5.7-25.4" fill="#ff3e00"/>
					<path d="M40.9 103.9a28 28 0 0 1-16-5.7l.5-.3 18.7-10.8c.9-.6 1.5-1.5 1.5-2.6V52.8l7.9 4.6v34c0 7.3-5.9 13.1-12.6 12.5M18 84.7a24 24 0 0 1-3.6-18.2l.5.3 18.7 10.8c.9.5 2.1.5 3 0l22.8-13.2V73l-19 11a13.2 13.2 0 0 1-17.6-4l-4.9 4.7M11.4 38.8a24 24 0 0 1 12.5-10.5v22.3c0 1 .6 2 1.5 2.5l22.8 13.2-7.9 4.5L21.7 60A13.2 13.2 0 0 1 11.4 38.8M78.4 55l-22.8 13.2 7.9 4.5 18.6-10.7c4.8-2.8 7.7-7.8 8-13.2a24 24 0 0 1-3.6 18.1l-.5-.3L67.3 56c-.9-.5-2.1-.5-3 0L41.5 69.2v-8.6l19-11c7-4 16-1.6 20 5.4l-2 0M80.2 79.7a24 24 0 0 1-12.5 10.5V67.9c0-1-.6-2-1.5-2.5L43.4 52.2l7.9-4.5L69.9 58c7 4.1 9.4 13 5.4 20l4.9 1.6" fill="#fff"/>
				</svg>
				<span class="text-3xl font-extralight text-muted-foreground/40">+</span>
				<!-- langgraph logo -->
				<svg class="h-10 w-10 opacity-60 transition-opacity hover:opacity-100" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
					<rect width="64" height="64" rx="14" fill="#1C3C3C"/>
					<path d="M20 44V20h6v18h12v6H20z" fill="#36BFBF"/>
					<path d="M42 20h6v24h-6zM42 20h-8v6h8z" fill="#EF4444"/>
					<circle cx="45" cy="44" r="4" fill="#36BFBF"/>
				</svg>
			</div>

			<div
				class="animate-fade-in-up-delay-1 mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-primary-600/20 bg-primary-600/5 px-4 py-1.5 text-sm backdrop-blur-sm"
			>
				<span class="size-2 animate-pulse rounded-full bg-primary-500"></span>
				<span class="text-muted-foreground">Open Source · MIT License · LangGraph Native</span>
			</div>

			<h1
				class="animate-fade-in-up-delay-1 mb-6 text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl xl:text-7xl"
			>
				Your agent works.<br />
				<span class="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent"
					>Your frontend should too.</span
				>
			</h1>

			<p
				class="animate-fade-in-up-delay-2 mx-auto mb-10 max-w-2xl text-balance text-xl leading-relaxed text-muted-foreground"
			>
				A production-ready, security-first SvelteKit UI that connects directly to your LangGraph
				server. Built for developers who need a frontend they can audit, customize, and maintain
				for years — not weeks.
			</p>

			<div class="animate-fade-in-up-delay-3 mb-16 flex flex-col justify-center gap-4 sm:flex-row">
				<a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
					<Button size="lg" class="cursor-pointer gap-2 px-8 text-base shadow-lg shadow-primary-600/20">
						<Github class="size-5" />
						View on GitHub
					</Button>
				</a>
				<a href="/chat">
					<Button size="lg" variant="outline" class="cursor-pointer gap-2 px-8 text-base">
						Try the demo
						<ArrowRight class="size-4" />
					</Button>
				</a>
			</div>

			<!-- Terminal -->
			<div
				class="animate-fade-in-up-delay-4 mx-auto max-w-2xl overflow-hidden rounded-xl border bg-card/80 shadow-2xl shadow-black/10 ring-1 ring-white/5 backdrop-blur-md dark:shadow-black/30"
			>
				<div class="flex items-center gap-2 border-b px-4 py-3">
					<div class="size-3 rounded-full bg-red-500/70"></div>
					<div class="size-3 rounded-full bg-yellow-500/70"></div>
					<div class="size-3 rounded-full bg-green-500/70"></div>
					<span class="ml-3 flex items-center gap-1.5 text-xs text-muted-foreground">
						<Terminal class="size-3" />
						terminal
					</span>
				</div>
				<div class="space-y-2 p-5 text-left font-mono text-sm leading-relaxed">
					<div>
						<span class="select-none text-muted-foreground">$ </span>
						<span class="text-primary-600">git</span>
						<span class="text-foreground/80"> clone https://github.com/synergyai-nl/svelte-langgraph</span>
					</div>
					<div>
						<span class="select-none text-muted-foreground">$ </span>
						<span class="text-primary-600">cp</span>
						<span class="text-foreground/80"> .env.example .env</span>
						<span class="text-muted-foreground/60"> &nbsp;# add your config</span>
					</div>
					<div>
						<span class="select-none text-muted-foreground">$ </span>
						<span class="text-primary-600">moon</span>
						<span class="text-foreground/80"> :dev</span>
					</div>
					<div class="flex items-center gap-2 pt-1 text-green-500/80">
						<span>&#10003; Ready on http://localhost:5173</span>
						<span class="animate-typing-cursor inline-block h-4 w-0.5 bg-green-500/60"></span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ── Value proposition ─────────────────────────────────────────────────── -->
	<section class="border-t py-24">
		<div class="mx-auto max-w-7xl px-6">
			<div class="grid items-center gap-16 md:grid-cols-2">
				<div>
					<p class="mb-4 text-sm font-semibold uppercase tracking-widest text-primary-600">
						The gap
					</p>
					<h2 class="mb-6 text-balance text-4xl font-bold tracking-tight">
						Building the agent is the easy part.<br />
						<span class="text-muted-foreground/70">The frontend shouldn't be hard.</span>
					</h2>
					<p class="text-lg leading-relaxed text-muted-foreground">
						Python and LangGraph make agentic AI tractable. But the frontend landscape leaves you
						choosing between tools that break under maintenance pressure, lock you into opinionated
						stacks, or demand a separate TypeScript backend just to render a chat window.
					</p>
				</div>
				<div class="space-y-4">
					{#each [
						'Upstream UI changes break your customizations without warning',
						'Codebases too complex or generated to meaningfully audit',
						'TypeScript backends you didn\'t ask for sitting between you and your Python agent',
						'Forked repos that drift from upstream and lose security coverage',
						'Integrations that work in the demo but crumble months into production'
					] as pain}
						<div
							class="flex items-start gap-3 rounded-lg border border-destructive/15 bg-destructive/5 px-4 py-3 transition-colors hover:border-destructive/25"
						>
							<X class="mt-0.5 size-4 shrink-0 text-destructive/70" />
							<span class="text-sm text-muted-foreground">{pain}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- ── Features ──────────────────────────────────────────────────────────── -->
	<section class="relative border-t py-24">
		<div
			class="absolute inset-0 bg-gradient-to-b from-muted/30 via-muted/10 to-transparent"
		></div>
		<div class="relative mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<p class="mb-4 text-sm font-semibold uppercase tracking-widest text-primary-600">
					Why svelte-langgraph
				</p>
				<h2 class="text-4xl font-bold tracking-tight">
					Built for the long haul.<br />
					<span class="text-muted-foreground/60">Not the demo.</span>
				</h2>
			</div>

			<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each features as feature, i}
					{@const Icon = feature.icon}
					<Card.Root
						class="group relative border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary-600/5"
					>
						<div
							class="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-primary-600/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
						></div>
						<div class="relative">
							<div
								class="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-600/10 transition-colors group-hover:bg-primary-600/15"
							>
								<Icon class="size-6 text-primary-600" />
							</div>
							<h3 class="mb-2 text-lg font-semibold">{feature.title}</h3>
							<p class="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
						</div>
					</Card.Root>
				{/each}
			</div>
		</div>
	</section>

	<!-- ── Getting started ──────────────────────────────────────────────────── -->
	<section class="border-t py-24">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<p class="mb-4 text-sm font-semibold uppercase tracking-widest text-primary-600">
					Getting started
				</p>
				<h2 class="text-4xl font-bold tracking-tight">
					Fork it. Run it. Ship it.
				</h2>
			</div>

			<div class="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
				{#each steps as step}
					<div class="group text-center">
						<div
							class="mb-4 font-mono text-6xl font-bold text-primary-600/15 transition-colors group-hover:text-primary-600/30"
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
	<section class="relative border-t py-24">
		<div
			class="absolute inset-0 bg-gradient-to-b from-muted/30 via-muted/10 to-transparent"
		></div>
		<div class="relative mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<p class="mb-4 text-sm font-semibold uppercase tracking-widest text-primary-600">
					Who it's for
				</p>
				<h2 class="text-4xl font-bold tracking-tight">Built for builders.</h2>
			</div>

			<div class="mx-auto grid max-w-5xl gap-6 sm:grid-cols-3">
				{#each personas as persona}
					{@const Icon = persona.icon}
					<div
						class="group rounded-xl border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary-600/5"
					>
						<div
							class="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary-600/10 transition-colors group-hover:bg-primary-600/15"
						>
							<Icon class="size-5 text-primary-600" />
						</div>
						<h3 class="mb-3 text-lg font-semibold">{persona.title}</h3>
						<p class="text-sm leading-relaxed text-muted-foreground">{persona.description}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ── Landscape ─────────────────────────────────────────────────────────── -->
	<section class="border-t py-24">
		<div class="mx-auto max-w-5xl px-6">
			<div class="mb-16 text-center">
				<p class="mb-4 text-sm font-semibold uppercase tracking-widest text-primary-600">
					The landscape
				</p>
				<h2 class="mb-4 text-4xl font-bold tracking-tight">
					Know what you're choosing.
				</h2>
				<p class="mx-auto max-w-2xl text-lg text-muted-foreground">
					Every tool in this space makes different trade-offs. Here's an honest look at where
					svelte-langgraph fits alongside other solid options.
				</p>
			</div>

			<div class="overflow-x-auto">
				<div class="min-w-[640px] overflow-hidden rounded-xl border">
					<!-- Header -->
					<div class="grid grid-cols-5 border-b bg-muted/30">
						<div class="p-4 text-sm font-medium text-muted-foreground"></div>
						<div class="border-l p-4 text-center">
							<span class="font-semibold text-primary-600">svelte-langgraph</span>
						</div>
						<div class="border-l p-4 text-center">
							<span class="font-semibold text-muted-foreground">Chainlit</span>
						</div>
						<div class="border-l p-4 text-center">
							<span class="font-semibold text-muted-foreground">Open WebUI</span>
						</div>
						<div class="border-l p-4 text-center">
							<span class="font-semibold text-muted-foreground">Custom React</span>
						</div>
					</div>
					<!-- Rows -->
					{#each comparison as row, i}
						<div
							class="grid grid-cols-5 border-b last:border-b-0 {i % 2 === 1 ? 'bg-muted/10' : ''}"
						>
							<div class="p-4 text-sm">{row.label}</div>
							{#each getRowCells(row) as status}
								{@const Icon = statusIcon(status)}
								<div class="flex items-center justify-center border-l p-4">
									<Icon class="size-5 {statusColor(status)}" />
								</div>
							{/each}
						</div>
					{/each}
				</div>
			</div>

			<p class="mt-6 text-center text-sm text-muted-foreground">
				Every project here represents real effort from people who care about the ecosystem. We
				built svelte-langgraph for teams that prioritize long-term stability, code auditability,
				and security.
			</p>
		</div>
	</section>

	<!-- ── Roadmap ───────────────────────────────────────────────────────────── -->
	<section class="relative border-t py-24">
		<div
			class="absolute inset-0 bg-gradient-to-b from-muted/30 via-muted/10 to-transparent"
		></div>
		<div class="relative mx-auto max-w-3xl px-6">
			<div class="mb-16 text-center">
				<p class="mb-4 text-sm font-semibold uppercase tracking-widest text-primary-600">
					Roadmap
				</p>
				<h2 class="mb-4 text-4xl font-bold tracking-tight">Where we are. Where we're going.</h2>
				<p class="mx-auto max-w-xl text-lg text-muted-foreground">
					We're building in the open. Here's what's shipped, what's in progress, and what's next.
				</p>
			</div>

			<div class="relative space-y-0">
				<!-- Timeline line -->
				<div
					class="absolute left-[19px] top-2 bottom-2 w-px bg-gradient-to-b from-green-500/40 via-primary-500/40 to-muted-foreground/20"
				></div>

				{#each roadmap as item}
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
								<div class="flex size-7 items-center justify-center rounded-full bg-primary-600/15">
									<CircleDot class="size-4 animate-pulse text-primary-600" />
								</div>
							{:else}
								<div class="flex size-7 items-center justify-center rounded-full bg-muted">
									<Circle class="size-4 text-muted-foreground/40" />
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
									<Badge variant="outline" class="text-xs text-green-600 border-green-600/30 bg-green-500/5">Shipped</Badge>
								{:else if isActive}
									<Badge variant="outline" class="text-xs text-primary-600 border-primary-600/30 bg-primary-600/5">In progress</Badge>
								{:else}
									<Badge variant="outline" class="text-xs text-muted-foreground/60">Planned</Badge>
								{/if}
							</div>
							<p class="mt-1 text-sm text-muted-foreground">{item.description}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ── Final CTA ─────────────────────────────────────────────────────────── -->
	<section class="relative border-t py-28">
		<div
			class="animate-glow-pulse absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_50%,hsl(var(--accent)/0.15),transparent)]"
		></div>
		<div class="relative mx-auto max-w-4xl px-6 text-center">
			<h2
				class="mb-6 text-balance text-5xl font-bold leading-tight tracking-tight sm:text-6xl"
			>
				Your agent deserves a frontend<br />
				<span class="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent"
					>built to last.</span
				>
			</h2>
			<p class="mx-auto mb-10 max-w-2xl text-xl text-muted-foreground">
				Open source. MIT licensed. Security-first. Fork it, configure it, and ship something
				you'll still be proud of next year.
			</p>
			<div class="flex flex-col justify-center gap-4 sm:flex-row">
				<a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
					<Button size="lg" class="cursor-pointer gap-2 px-8 text-base shadow-lg shadow-primary-600/20">
						<Github class="size-5" />
						Star on GitHub
					</Button>
				</a>
				<a href="/chat">
					<Button size="lg" variant="outline" class="cursor-pointer gap-2 px-8 text-base">
						Try the demo
						<ArrowRight class="size-4" />
					</Button>
				</a>
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
						<path d="M91.8 15.6C80.9-.1 59.2-4.7 43.6 5.2L16.1 22.8C8.6 27.5 3.4 35.2 1.9 43.9c-1.3 7.3-.2 14.8 3.3 21.3-2.4 3.6-4 7.6-4.7 11.8-1.6 8.9.5 18.1 5.7 25.4 11 15.7 32.6 20.3 48.2 10.4l27.5-17.6c7.5-4.7 12.7-12.4 14.2-21.1 1.3-7.3.2-14.8-3.3-21.3 2.4-3.6 4-7.6 4.7-11.8 1.7-9-.4-18.2-5.7-25.4" fill="currentColor"/>
					</svg>
					<span class="text-xs text-muted-foreground">MIT License · Built with Svelte + LangGraph</span>
				</div>
				<div class="flex items-center gap-4">
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
