<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Client } from '@langchain/langgraph-sdk';
	import { PUBLIC_LANGCHAIN_API_KEY, PUBLIC_LANGGRAPH_API_URL } from '$env/static/public';
	import Chat from '$lib/components/Chat.svelte';
	import ChatSkeleton from '$lib/components/ChatSkeleton.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';

	const client = new Client({
		// Observe that this is insecure
		// We need to find a way to pass Descope's auth token which we can verify on the
		// the langgraph side.
		apiKey: PUBLIC_LANGCHAIN_API_KEY,
		apiUrl: PUBLIC_LANGGRAPH_API_URL
	});

	let show_login_dialog = $state(false);
	let chat_started = $state(false);
	let assistantId = $state('');
	let threadId = $state('');
	let isLoading = $state(true);

	onMount(async () => {
		if (!page.data.session) show_login_dialog = true;

		try {
			const thread = await client.threads.create();
			threadId = thread.thread_id;
			const assistant = await client.assistants.create({
				graphId: 'chat' // process.env.LANGGRAPH_GRAPH_ID as string
			});
			assistantId = assistant.assistant_id;
		} catch (error) {
			console.error('Error initializing chat:', error);
		} finally {
			isLoading = false;
		}
	});

	function handleChatStart() {
		chat_started = true;
	}
</script>


{#if isLoading}
	<ChatSkeleton />
{:else}
	<Chat
		{client}
		{assistantId}
		{threadId}
		userName={page.data.session?.user?.name}
		userEmail={page.data.session?.user?.email}
		chatStarted={chat_started}
		onChatStart={handleChatStart}
	/>
{/if}

<LoginModal bind:open={show_login_dialog} />
