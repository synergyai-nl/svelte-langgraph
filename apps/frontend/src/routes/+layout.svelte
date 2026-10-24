<script lang="ts">
	import '../app.tailwind.css';

	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import Header from '$lib/components/Header.svelte';
	import { seedBackendToken } from '$lib/auth/backendToken.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { children } = $props();

	// Before any child mounts, so a chat's first request reuses the token this page load carried.
	$effect.pre(() => seedBackendToken(page.data.session));

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
	<!--
		The only place in the app that is allowed to reference viewport height: everything below
		sizes itself against its parent (h-full / flex-1), never against the viewport.
	-->
	<div class="flex h-svh flex-col">
		<Header variant={headerVariant} />

		<main class="min-h-0 flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>
</Tooltip.Provider>
