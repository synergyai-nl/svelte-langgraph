<script>
	import Button from '$lib/components/ui/button/button.svelte';
	import { Rocket, ArrowRight, Video } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
</script>

<main class="overflow-hidden">
	<section>
		<div class="relative pt-16">
			<div class="mx-auto max-w-7xl px-6">
				<div class="mx-auto max-w-4xl text-center">
					<a
						href="/"
						class="mx-auto flex w-fit items-center gap-2 rounded-(--radius) border p-1 pr-3"
					>
						<span class="bg-muted rounded-[calc(var(--radius)-0.25rem)] px-2 py-1 text-xs"
							>{m.landing_news_new()}</span
						>
						<span class="text-sm">{m.landing_news_text()}</span>
						<span class="block h-4 w-px bg-(--color-border)"></span>
						<ArrowRight class="size-4" />
					</a>

					<h1
						class="mt-6 text-4xl font-semibold text-balance md:text-5xl xl:text-6xl xl:[line-height:1.125]"
					>
						{m.landing_hero_title()}
					</h1>

					<p class="mx-auto mt-6 hidden max-w-2xl text-lg text-wrap sm:block">
						{m.landing_hero_subtitle()}
					</p>

					<p class="mx-auto mt-4 max-w-2xl text-wrap sm:hidden">
						{m.landing_hero_subtitle()}
					</p>

					<div
						class="mt-6 flex flex-col space-y-4 sm:flex-row sm:justify-center sm:space-y-0 sm:space-x-4"
					>
						<a href="/chat">
							<Button size="lg">
								<Rocket class="relative size-4" />
								<span class="text-nowrap">{m.landing_cta_get_started()}</span>
							</Button>
						</a>
						<a href="/">
							<Button size="lg" variant="outline">
								<Video class="mr-2 -ml-1 h-4 w-4" />
								<span class="text-nowrap">{m.landing_cta_watch_video()}</span>
							</Button>
						</a>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="relative z-10 pt-16 pb-24">
		<div class="mx-auto max-w-7xl px-6">
			<h2 class="text-muted-foreground text-center text-lg font-medium tracking-wide uppercase">
				{m.landing_featured_in()}
			</h2>
			<div class="mx-auto mt-12 flex max-w-3xl items-center justify-center gap-16 md:gap-24">
				<!-- YouTube Logo -->
				<div class="flex items-center gap-3 opacity-60 transition-opacity hover:opacity-100">
					<svg class="h-8 w-8 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
						<path
							d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
						/>
					</svg>
					<span class="text-xl font-semibold">YouTube</span>
				</div>

				<!-- Product Hunt Logo -->
				<div class="flex items-center gap-3 opacity-60 transition-opacity hover:opacity-100">
					<svg class="h-8 w-8 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
						<path
							d="M13.604 9.396h-3.199V12h3.199c.717 0 1.302-.584 1.302-1.302s-.585-1.302-1.302-1.302z"
						/>
						<path
							d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm1.604 13.396h-3.199v3.599H8.406V7.005h5.198c1.528 0 2.791 1.263 2.791 2.791s-1.263 2.6-2.791 2.6z"
						/>
					</svg>
					<span class="text-xl font-semibold">Product Hunt</span>
				</div>

				<!-- Reddit Logo -->
				<div class="flex items-center gap-3 opacity-60 transition-opacity hover:opacity-100">
					<svg class="h-8 w-8 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
						<path
							d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"
						/>
					</svg>
					<span class="text-xl font-semibold">reddit</span>
				</div>
			</div>
		</div>
	</section>
</main>
