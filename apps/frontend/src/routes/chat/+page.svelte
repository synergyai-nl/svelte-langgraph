<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Client } from '@langchain/langgraph-sdk';
	import { PUBLIC_LANGCHAIN_API_KEY, PUBLIC_LANGGRAPH_API_URL } from '$env/static/public';
	import Chat from '$lib/components/Chat.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import type { ChatSuggestion } from '$lib/types/messageTypes';

	const client = new Client({
		// Observe that this is insecure
		// We need to find a way to pass Descope's auth token which we can verify on the
		// the langgraph side.
		apiKey: PUBLIC_LANGCHAIN_API_KEY,
		apiUrl: PUBLIC_LANGGRAPH_API_URL
	});

	let show_login_dialog = $state(false);
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

	const suggestions: ChatSuggestion[] = [
		{
			title: 'Creative Brainstorming',
			description: 'Generate ideas for projects, writing, or problem-solving',
			suggestedText: 'Help me brainstorm ideas for a creative project'
		},
		{
			title: 'Writing Assistance',
			description: 'Draft, edit, or improve emails, documents, and more',
			suggestedText: 'Help me write and improve some text'
		},
		{
			title: 'Learn Something New',
			description: "Get clear explanations on topics you're curious about",
			suggestedText: 'Explain a complex topic in simple terms'
		},
		{
			title: 'Problem Solving',
			description: 'Break down challenges and find solutions together',
			suggestedText: 'Help me analyze and solve a problem'
		}
	];

	let greeting = $derived.by(() => {
		const userName = page.data.session?.user?.name;

		if (userName) {
			return `Hey ${userName}, how can I help you today?`;
		} else {
			return 'How can I help you today?';
		}
	});
</script>

{#if isLoading}
	<ChatLoader />
{:else}
	<Chat
		langGraphClient={client}
		{assistantId}
		{threadId}
		introTitle={greeting}
		intro="I'm here to assist with your questions, provide information, help with tasks, or engage in conversation."
		{suggestions}
	/>
{/if}

<LoginModal bind:open={show_login_dialog} />
