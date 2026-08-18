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
			title: 'Connect Python agents directly',
			description:
				'Connects directly to your LangGraph server. No TypeScript backend required. Full streaming for tool calls and complex agentic workflows.'
		},
		{
			icon: Shield,
			title: 'Pass security review. Stay maintainable.',
			description:
				'OIDC built in. Auditable code for security teams — with long-term security support as a design goal, not a patch-and-pray cadence.'
		},
		{
			icon: Blocks,
			title: 'Customize every layer — no lock-in',
			description:
				'Every component layer is independently configurable. Built on bits-ui and shadcn-svelte — override anything, extend everything.'
		},
		{
			icon: Key,
			title: 'Swap models without rewriting',
			description:
				'All LLM providers via the OpenAI-compatible protocol — Anthropic, OpenAI, local models, Azure, and more.'
		}
	] as const;

	const comparison: ComparisonRow[] = [
		{
			label: 'Security review friendly',
			svelteLanggraph: 'yes',
			langflow: 'partial',
			chainlit: 'partial',
			openWebui: 'partial',
			customReact: 'yes'
		},
		{
			label: 'LangGraph / Python native',
			svelteLanggraph: 'yes',
			langflow: 'yes',
			chainlit: 'yes',
			openWebui: 'partial',
			customReact: 'partial'
		},
		{
			label: 'Code quality & auditability',
			svelteLanggraph: 'yes',
			langflow: 'partial',
			chainlit: 'partial',
			openWebui: 'partial',
			customReact: 'yes'
		},
		{
			label: 'Security-first (OIDC built in)',
			svelteLanggraph: 'yes',
			langflow: 'partial',
			chainlit: 'no',
			openWebui: 'partial',
			customReact: 'no'
		},
		{
			label: 'Full streaming (tools + workflows)',
			svelteLanggraph: 'yes',
			langflow: 'partial',
			chainlit: 'yes',
			openWebui: 'partial',
			customReact: 'partial'
		},
		{
			label: 'Per-component customization',
			svelteLanggraph: 'yes',
			langflow: 'partial',
			chainlit: 'no',
			openWebui: 'partial',
			customReact: 'yes'
		},
		{
			label: 'No JS backend required',
			svelteLanggraph: 'yes',
			langflow: 'yes',
			chainlit: 'yes',
			openWebui: 'no',
			customReact: 'no'
		},
		{
			label: 'Active large community',
			svelteLanggraph: 'no',
			langflow: 'yes',
			chainlit: 'yes',
			openWebui: 'yes',
			customReact: 'yes'
		},
		{
			label: 'Broad feature surface',
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
			title: 'Python AI developers',
			description:
				'Stop spending sprints on React glue. Focus on the agent — connect a frontend that speaks LangGraph natively without a TypeScript-heavy stack.'
		},
		{
			icon: GitFork,
			title: 'Boutique AI agencies',
			description:
				'Ship branded agent UIs you can customize, maintain, and hand over to clients with confidence.'
		},
		{
			icon: Layers,
			title: 'SaaS platform teams',
			description:
				'Embed OIDC-ready agent chat your security team can audit — built for the long haul inside your existing product.'
		},
		{
			icon: Headphones,
			title: 'CX & support teams',
			description:
				'Deploy LangGraph-powered chatbots without a custom frontend team — fork, brand, and ship support agents on a budget.'
		}
	];

	const steps: Step[] = [
		{
			step: '01',
			title: 'Install toolchain',
			description:
				'Install Proto in the repo root (`proto install`). Pins Moon, pnpm, Node, and Python per .prototools — one toolchain for the whole monorepo.'
		},
		{
			step: '02',
			title: 'Configure & run',
			description:
				'`cp .env.example .env`, then `moon :dev :oidc-mock` — frontend, backend, and OIDC mock with hot reload. Always include :oidc-mock for local auth.'
		},
		{
			step: '03',
			title: 'Deploy to your stack',
			description:
				'Deploy with the included config — Docker, your OIDC provider, your LangGraph server. Pull upstream security patches without the rewrite treadmill.'
		}
	];

	const roadmap: RoadmapItem[] = [
		{
			title: 'Core chat UI with streaming',
			description: 'Full message streaming and tool-call visibility in the chat UI',
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
			title: 'Embeddable web component',
			description:
				'Drop the chat UI into any app — Svelte or not — as an in-app component or web component with auth',
			status: 'planned'
		},
		{
			title: 'Admin dashboard',
			description: 'Monitor agents, view usage, and manage users from a built-in admin panel',
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
							Your agent works.<br />
							<span
								class="from-primary-600 to-primary-400 bg-gradient-to-r bg-clip-text text-transparent"
								>Your frontend should too.</span
							>
						</h1>

						<p
							class="animate-fade-in-up-delay-2 text-muted-foreground text-lg leading-relaxed lg:max-w-xl lg:text-xl lg:leading-relaxed"
						>
							The production SvelteKit frontend for LangGraph agents. Ship a secure, customizable UI
							without a TypeScript backend — OIDC-ready and built to stay maintainable for years.
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
								Open the chat
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
								Try live demo
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
								View on GitHub
							</Button>
						</div>
						<p class="text-muted-foreground text-sm">
							Explore streaming, tool calls, and auth — no local setup required.
							<a
								href={DOCS_URL}
								target="_blank"
								rel="noopener noreferrer"
								class="text-foreground/80 hover:text-foreground ml-1 inline-flex items-center gap-1 underline-offset-4 transition-colors hover:underline"
							>
								Read the docs
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
						The gap
					</p>
					<h2 class="mb-6 text-4xl font-bold tracking-tight text-balance">
						Building the agent is the easy part.<br />
						<span class="text-muted-foreground/70">The frontend shouldn't be hard.</span>
					</h2>
					<p class="text-muted-foreground text-lg leading-relaxed">
						Python and LangGraph make agentic AI tractable. But the frontend landscape leaves you
						choosing between tools that break under maintenance pressure, lock you into opinionated
						stacks, or demand a separate TypeScript backend just to render a chat window.
					</p>
				</div>
				<div class="space-y-4">
					{#each ['Upstream UI changes break your customizations without warning', 'Codebases too complex or generated to meaningfully audit', "TypeScript backends you didn't ask for sitting between you and your Python agent", 'Forked repos that drift from upstream and lose security coverage', 'Integrations that work in the demo but crumble months into production'] as pain (pain)}
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
					Why svelte-langgraph
				</p>
				<h2 class="text-4xl font-bold tracking-tight">
					Built for the long haul.<br />
					<span class="text-muted-foreground/60">Not the demo.</span>
				</h2>
				<p class="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
					React has plenty of agent UIs. Svelte deserves a first-class LangGraph frontend — fast,
					joyful to customize, and built for production ownership.
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
				Built with Svelte, bits-ui, shadcn-svelte, Proto, and Moon — pinned toolchains across Node
				and Python.
			</p>
		</div>
	</section>

	<!-- ── Getting started ──────────────────────────────────────────────────── -->
	<section class="py-24">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<p class="text-primary-600 mb-4 text-sm font-semibold tracking-widest uppercase">
					Getting started
				</p>
				<h2 class="text-4xl font-bold tracking-tight">Clone it. Run it. Ship it.</h2>
				<p class="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
					Today: clone or fork the repo. Soon: install as a package — no fork required.
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
					Who it's for
				</p>
				<h2 class="text-4xl font-bold tracking-tight">Built for builders.</h2>
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
					The landscape
				</p>
				<h2 class="mb-4 text-4xl font-bold tracking-tight">Know what you're choosing.</h2>
				<p class="text-muted-foreground mx-auto max-w-2xl text-lg">
					Every tool in this space makes different trade-offs. Here's an honest look at where
					svelte-langgraph fits alongside other solid options.
				</p>
			</div>

			<LandscapeComparisonTable rows={comparison} />

			<p class="text-muted-foreground mt-6 text-center text-sm">
				Every project here represents real effort from people who care about the ecosystem. Choose
				svelte-langgraph for quality, security, and long-term maintainability — when a
				production-grade UI you can audit and support for years matters more than the broadest
				feature set out of the box.
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
				Streamlit excels at data apps and demos — a different category than production agent chat
				UIs.
			</p>
		</div>
	</section>

	<!-- ── Roadmap ───────────────────────────────────────────────────────────── -->
	<section class="relative py-24">
		<div class="from-muted/30 via-muted/10 absolute inset-0 bg-gradient-to-b to-transparent"></div>
		<div class="relative mx-auto max-w-3xl px-6">
			<div class="mb-16 text-center">
				<p class="text-primary-600 mb-4 text-sm font-semibold tracking-widest uppercase">Roadmap</p>
				<h2 class="mb-4 text-4xl font-bold tracking-tight">Where we are. Where we're going.</h2>
				<p class="text-muted-foreground mx-auto max-w-xl text-lg">
					We're building in the open. Here's what's shipped, what's in progress, and what's next.
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
									<CircleDot class="text-primary-600 size-4 animate-pulse" />
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
										class="border-green-600/30 bg-green-500/5 text-xs text-green-600">Shipped</Badge
									>
								{:else if isActive}
									<Badge
										variant="outline"
										class="text-primary-600 border-primary-600/30 bg-primary-600/5 text-xs"
										>In progress</Badge
									>
								{:else}
									<Badge variant="outline" class="text-muted-foreground/60 text-xs">Planned</Badge>
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
				Built in the open
			</p>
			<h2 class="mb-4 text-4xl font-bold tracking-tight">Help shape what ships next.</h2>
			<p class="text-muted-foreground mx-auto mb-8 max-w-2xl text-lg leading-relaxed">
				MIT licensed on GitHub. Try the live demo, open an issue, send a PR, or tell us what you
				built — contributors steer the roadmap as much as the maintainers.
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
					Star on GitHub
				</Button>
				<Button
					href={`${GITHUB_URL}/issues`}
					target="_blank"
					rel="noopener noreferrer"
					size="lg"
					variant="ghost"
					class="cursor-pointer gap-2 px-8 text-base"
				>
					Open an issue
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
				Your agent is the product.<br />
				<span class="from-primary-600 to-primary-400 bg-gradient-to-r bg-clip-text text-transparent"
					>The frontend is how users trust it.</span
				>
			</h2>
			<p class="text-muted-foreground mx-auto mb-10 max-w-2xl text-xl">
				Open source. MIT licensed. Security-first. Fork it, configure it, and ship something you'll
				still be proud of next year.
			</p>
			<div class="flex flex-col justify-center gap-4 sm:flex-row">
				<Button
					href={DEMO_URL}
					target="_blank"
					rel="noopener noreferrer"
					size="lg"
					class="shadow-primary-600/20 cursor-pointer gap-2 px-8 text-base shadow-lg"
				>
					Try live demo
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
					View on GitHub
				</Button>
				<Button
					href={DOCS_URL}
					target="_blank"
					rel="noopener noreferrer"
					size="lg"
					variant="ghost"
					class="cursor-pointer gap-2 px-8 text-base"
				>
					Read the docs
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
					<span class="text-muted-foreground text-xs"
						>MIT License · Maintained by SynergyAI · Built with Svelte + LangGraph</span
					>
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
