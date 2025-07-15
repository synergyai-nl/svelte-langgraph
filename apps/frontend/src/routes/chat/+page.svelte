<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Client } from '@langchain/langgraph-sdk';
	import { PUBLIC_LANGGRAPH_API_URL } from '$env/static/public';
	import Chat from '$lib/components/Chat.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';

	interface LangGraphState {
		client: Client;
		threadId: string;
		assistantId: string;
	}

	let show_login_dialog = $state(false);
	let chat_started = $state(false);

	let langgraph: LangGraphState | null = $state(null);

	$effect(() => {
		// User logged in or switched accounts - initialize
		(async () => {
			const accessToken: string | undefined = page.data.session?.accessToken;
			if (accessToken) await initializeLangGraph(accessToken);
		})();
	});

	async function initializeLangGraph(accessToken: string) {
		const client = new Client({
			defaultHeaders: {
				Authorization: `Bearer ${accessToken}`
			},
			apiUrl: PUBLIC_LANGGRAPH_API_URL
		});

		const thread = await client.threads.create();
		const assistant = await client.assistants.create({
			graphId: 'chat'
		});

		langgraph = {
			client,
			threadId: thread.thread_id,
			assistantId: assistant.assistant_id
		};
	}

	onMount(async () => {
		if (!page.data.session) show_login_dialog = true;
	});

	function handleChatStart() {
		chat_started = true;
	}
</script>

{#if !langgraph}
	<ChatLoader />
{:else}
	<Chat
		langGraphClient={langgraph.client}
		assistantId={langgraph.assistantId}
		threadId={langgraph.threadId}
		userName={page.data.session?.user?.name || page.data.session?.user?.email?.split('@')[0]}
		chatStarted={chat_started}
		onChatStart={handleChatStart}
	/>
{/if}

<LoginModal bind:open={show_login_dialog} />
