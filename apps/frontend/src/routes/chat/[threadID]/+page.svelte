<script lang="ts">
	import { page } from '$app/state';
	import ChatSurface from '$lib/components/chat/ChatSurface.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import ChatError from '$lib/components/ChatError.svelte';
	import { useLangGraph } from '$lib/components/chat/langGraphContext.svelte.js';
	import * as m from '$lib/paraglide/messages.js';

	// Client + assistant resolution now live in `+layout.svelte`'s `<LangGraph>` provider — this
	// page only reads the result.
	const ctx = useLangGraph();

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

{#if ctx.error}
	<ChatError error={ctx.error instanceof Error ? ctx.error : new Error(String(ctx.error))} />
{:else if ctx.assistantId && ctx.client}
	<ChatSurface
		threadId={page.params.threadID}
		introTitle={greeting}
		intro={m.chat_intro()}
		{suggestions}
	/>
{:else}
	<ChatLoader />
{/if}
