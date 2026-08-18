<script lang="ts">
	import { Terminal } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils';

	let { class: className = '' }: { class?: string } = $props();
</script>

<div
	class={cn(
		'bg-card/80 overflow-hidden rounded-xl border shadow-2xl ring-1 shadow-black/10 ring-white/5 backdrop-blur-md dark:shadow-black/30',
		className
	)}
>
	<div class="flex items-center gap-2 border-b px-4 py-3">
		<div class="size-3 rounded-full bg-red-500/70"></div>
		<div class="size-3 rounded-full bg-yellow-500/70"></div>
		<div class="size-3 rounded-full bg-green-500/70"></div>
		<span class="text-muted-foreground ml-3 flex items-center gap-1.5 text-xs">
			<Terminal class="size-3" />
			{m.landing_terminal_label()}
		</span>
	</div>
	<div
		data-testid="hero-terminal-body"
		class="space-y-2 p-5 text-left font-mono text-sm leading-relaxed"
	>
		<div>
			<span class="text-muted-foreground select-none">$ </span>
			<span class="text-primary-600">proto</span>
			<span class="text-foreground/80"> install</span>
		</div>
		<div>
			<span class="text-muted-foreground select-none">$ </span>
			<span class="text-primary-600">cp</span>
			<span class="text-foreground/80"> .env.example .env</span>
		</div>
		<div>
			<span class="text-muted-foreground select-none">$ </span>
			<span class="text-primary-600">moon</span>
			<span class="text-foreground/80"> :dev :oidc-mock</span>
		</div>
		<div class="flex items-center gap-2 pt-1 text-green-500/80">
			<span>&#10003; {m.landing_terminal_ready()}</span>
			<span class="animate-typing-cursor inline-block h-4 w-0.5 bg-green-500/60"></span>
		</div>
	</div>
</div>
