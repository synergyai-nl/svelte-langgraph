<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { page } from '$app/state';
	import type { Thread } from '@langchain/langgraph-sdk';
	import Chat from '$lib/components/Chat.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import { getOrCreateAssistant, createClient } from '$lib/langgraph/client';
	import * as m from '$lib/paraglide/messages.js';
	import type { Client } from '@langchain/langgraph-sdk';
	import type { ThreadValues } from '$lib/langgraph/types';
	import ChatError from '$lib/components/ChatError.svelte';

	let show_login_dialog = $state(!page.data.session);

	// Updates client whenever accessToken changes
	let client = $derived(page.data.session ? createClient(page.data.session.accessToken) : null);
	let assistantId = $state<string | null>(null);
	let thread = $state<Thread<ThreadValues> | null>(null);
	let threadId = $derived(page.params.threadID);
	let initialization_error = $state<Error | null>(null);

	async function initAssistantAndThread(client: Client, threadId: string) {
		try {
			assistantId = await getOrCreateAssistant(client, 'chat');
			const fetchedThread = await client.threads.get(threadId);
			thread = fetchedThread as Thread<ThreadValues>;
		} catch (err) {
			if (err instanceof Error) initialization_error = err;
			error(500, {
				message: 'Error during generation'
			});
		}
	}

	$effect(() => {
		if ((assistantId === null || thread === null) && client && threadId) {
			initAssistantAndThread(client, threadId);
		}
	});

	$effect.pre(() => {
		if (!page.data.session) show_login_dialog = true;
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
{:else if assistantId && thread && client}
	<!-- We're all set up -->
	<Chat
		langGraphClient={client}
		{assistantId}
		{thread}
		introTitle={greeting}
		intro={m.chat_intro()}
		{suggestions}
	/>
{:else}
	<ChatLoader />
{/if}

<LoginModal bind:open={show_login_dialog} />
