<script lang="ts">
	import '../app.tailwind.css';

	import { onMount } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import Header from '$lib/components/Header.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { children } = $props();

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
	<Header />

	<main>
		{@render children()}
	</main>
</Tooltip.Provider>
