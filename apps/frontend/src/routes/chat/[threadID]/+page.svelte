<script lang="ts">
	import { page } from '$app/state';
	import { getBackend } from '$lib/langgraph/backendContext';
	import Chat from '$lib/components/Chat.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import { getOrCreateAssistant } from '$lib/langgraph/client';
	import * as m from '$lib/paraglide/messages.js';
	import type { Client } from '@langchain/langgraph-sdk';
	import ChatError from '$lib/components/ChatError.svelte';

	const backend = getBackend();
	let client = $derived(backend.client);
	let assistantId = $state<string | null>(null);
	let threadId = $derived(page.params.threadID!);
	let initialization_error = $state<Error | null>(null);

	async function initAssistant(client: Client, isActive: () => boolean) {
		initialization_error = null;
		try {
			const id = await getOrCreateAssistant(client, 'chat');
			if (isActive()) assistantId = id;
		} catch (err) {
			if (!isActive()) return;
			initialization_error = err instanceof Error ? err : new Error(String(err));
		}
	}

	$effect(() => {
		void backend.recoveryGeneration;
		if (assistantId !== null || !client || !threadId) return;
		let active = true;
		initAssistant(client, () => active);
		return () => {
			active = false;
		};
	});

	const suggestions = [
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

{#if initialization_error}
	<ChatError error={initialization_error} />
{:else if assistantId && client}
	{#key `${threadId}:${backend.recoveryGeneration}`}
		<Chat
			langGraphClient={client}
			backendFetch={backend.fetch}
			{assistantId}
			{threadId}
			introTitle={greeting}
			intro={m.chat_intro()}
			{suggestions}
		/>
	{/key}
{:else}
	<ChatLoader />
{/if}
