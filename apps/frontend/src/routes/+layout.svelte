<script lang="ts">
	import '../app.tailwind.css';

	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import Header from '$lib/components/Header.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { children } = $props();

	const headerVariant = $derived(page.url.pathname === '/' ? 'marketing' : 'app');

	onMount(() => {
		document.body.classList.add('started');
	});
</script>

<svelte:head>
	<title>{m.page_title()}</title>
	<meta name="description" content={m.app_tagline()} />
</svelte:head>

<ModeWatcher />

<Tooltip.Provider>
	<Header variant={headerVariant} />

	<main>
		{@render children()}
	</main>
</Tooltip.Provider>
