<script lang="ts">
	import '../app.tailwind.css';

	import { onMount } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import Header from '$lib/components/Header.svelte';

	let { children } = $props();

	onMount(() => {
		document.body.classList.add('started');
	});
</script>

<ModeWatcher />

<Tooltip.Provider>
	<Header />

	<main>
		{@render children()}
	</main>
</Tooltip.Provider>
