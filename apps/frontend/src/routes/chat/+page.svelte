<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Chat from '$lib/components/Chat.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import type { ChatSuggestion } from '$lib/types/messageTypes';
	import type { Client } from '@langchain/langgraph-sdk';
	import { createLangGraphClient } from '$lib/langgraph/client';
	import * as m from '$lib/paraglide/messages.js';

	let show_login_dialog = $state(false);
	let client: Client | null = $state(null);

	$effect(() => {
		if (page.data.session?.accessToken) {
			client = createLangGraphClient(page.data.session.accessToken);
		}
	});

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

{#if !client || !page.data.langgraph}
	<ChatLoader />
{:else}
	<Chat
		langGraphClient={client}
		assistantId={page.data.langgraph.assistantId}
		threadId={page.data.langgraph.threadId}
		introTitle={greeting}
		intro={m.chat_intro()}
		{suggestions}
	/>
{/if}

<LoginModal bind:open={show_login_dialog} />
