<script lang="ts">
	import type { Client } from '@langchain/langgraph-sdk';
	import { setBackend } from '$lib/langgraph/backendContext';
	import ChatIndex from '../+page.svelte';

	let { client, recoveryGeneration = 0 }: { client: Client | null; recoveryGeneration?: number } =
		$props();

	setBackend({
		get client() {
			return client;
		},
		get recoveryGeneration() {
			return recoveryGeneration;
		},
		fetch: globalThis.fetch
	});
</script>

<ChatIndex />
