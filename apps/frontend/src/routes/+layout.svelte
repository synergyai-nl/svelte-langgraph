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
	<!--
		The only place in the app that is allowed to reference viewport height: everything below
		sizes itself against its parent (h-full / flex-1), never against the viewport.
	-->
	<div class="flex h-svh flex-col">
		<Header />

		<main class="min-h-0 flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>
</Tooltip.Provider>
