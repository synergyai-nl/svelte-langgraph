<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Client } from '@langchain/langgraph-sdk';
	import { PUBLIC_LANGGRAPH_API_URL } from '$env/static/public';
	import Chat from '$lib/components/Chat.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import type { ChatSuggestion } from '$lib/types/messageTypes';

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

{#if !langgraph}
	<ChatLoader />
{:else}
	<Chat
		langGraphClient={langgraph.client}
		assistantId={langgraph.assistantId}
		threadId={langgraph.threadId}
		introTitle={greeting}
		intro="I'm here to assist with your questions, provide information, help with tasks, or engage in conversation."
		{suggestions}
	/>
{/if}

<LoginModal bind:open={show_login_dialog} />
