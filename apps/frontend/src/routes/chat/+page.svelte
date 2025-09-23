<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Client } from '@langchain/langgraph-sdk';
	import { PUBLIC_LANGGRAPH_API_URL } from '$env/static/public';
	import Chat from '$lib/components/Chat.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import type { ChatSuggestion } from '$lib/types/messageTypes';
	import * as m from '$lib/paraglide/messages.js';

	interface LangGraphState {
		client: Client;
		threadId: string;
		assistantId: string;
	}

	let show_login_dialog = $state(false);

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
			title: m.chat_suggestion_0_title(),
			description: m.chat_suggestion_0_description(),
			suggestedText: m.chat_suggestion_0_text()
		},
		{
			title: m.chat_suggestion_1_title(),
			description: m.chat_suggestion_1_description(),
			suggestedText: m.chat_suggestion_1_text()
		},
		{
			title: m.chat_suggestion_2_title(),
			description: m.chat_suggestion_2_description(),
			suggestedText: m.chat_suggestion_2_text()
		},
		{
			title: m.chat_suggestion_3_title(),
			description: m.chat_suggestion_3_description(),
			suggestedText: m.chat_suggestion_3_text()
		}
	];

	let greeting = $derived.by(() => {
		const userName = page.data.session?.user?.name;

		if (userName) {
			return m.chat_greeting_hello({ name: userName });
		} else {
			return m.chat_greeting_anonymous();
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
		intro={m.chat_intro()}
		{suggestions}
	/>
{/if}

<LoginModal bind:open={show_login_dialog} />
