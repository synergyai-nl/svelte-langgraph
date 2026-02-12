<script lang="ts">
	import '../app.tailwind.css';

	import { ModeWatcher } from 'mode-watcher';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import Header from '$lib/components/Header.svelte';

	let { children } = $props();
</script>

<ModeWatcher />

<Tooltip.Provider>
	<Header />

	<main>
		{@render children()}
	</main>
</Tooltip.Provider>
