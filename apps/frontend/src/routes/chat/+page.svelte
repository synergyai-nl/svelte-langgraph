<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Chat from '$lib/components/Chat.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import { getOrCreateAssistant, createClient, getOrCreateThread } from '$lib/langgraph/client';
	import * as m from '$lib/paraglide/messages.js';
	import type { Client, Thread, DefaultValues } from '@langchain/langgraph-sdk';
	import ChatError from '$lib/components/ChatError.svelte';

	let show_login_dialog = $state(false);

	// Updates client whenever accessToken changes
	let client = $derived(page.data.session ? createClient(page.data.session.accessToken) : null);
	let assistantId = $state<string | null>(null);
	let threadId = $state<string | null>(null);
	let thread = $state<Thread<DefaultValues> | null>(null);
	let initialization_error = $state<Error | null>(null);

	async function initLangGraph(client: Client) {
		try {
			assistantId = await getOrCreateAssistant(client, 'chat');
			thread = await getOrCreateThread(client);
			threadId = thread.thread_id;
		} catch (err) {
			if (err instanceof Error) initialization_error = err;
			error(500, {
				message: 'Error during generation'
			});
		}
	}

	$effect(() => {
		if ((assistantId === null || threadId === null) && client) initLangGraph(client);
	});

	onMount(async () => {
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
{:else if assistantId &&  thread && client}
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
