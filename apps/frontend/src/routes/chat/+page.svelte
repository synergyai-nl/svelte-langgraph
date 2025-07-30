<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Client } from '@langchain/langgraph-sdk';
	import { PUBLIC_LANGGRAPH_API_URL } from '$env/static/public';
	import Chat from '$lib/components/Chat.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import type { ChatSuggestion } from '$lib/types/messageTypes';

	let show_login_dialog = $state(false);
	let client: Client | null = $state(null);

	$effect(() => {
		if (page.data.session?.accessToken && page.data.langgraph) {
			client = new Client({
				defaultHeaders: {
					Authorization: `Bearer ${page.data.session.accessToken}`
				},
				apiUrl: PUBLIC_LANGGRAPH_API_URL
			});
		}
	});

	onMount(async () => {
		if (!page.data.session) show_login_dialog = true;
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

{#if !client || !page.data.langgraph}
	<ChatLoader />
{:else}
	<Chat
		langGraphClient={client}
		assistantId={page.data.langgraph.assistantId}
		threadId={page.data.langgraph.threadId}
		introTitle={greeting}
		intro="I'm here to assist with your questions, provide information, help with tasks, or engage in conversation."
		{suggestions}
	/>
{/if}

<LoginModal bind:open={show_login_dialog} />
