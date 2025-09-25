<script lang="ts">
	import ChatMessage from './ChatMessage.svelte';
	import ToolMessage from './ToolMessage.svelte';
	import type { Message, BaseMessage, ToolMessageType } from '$lib/types/messageTypes';
	import type { Attachment } from 'svelte/attachments';

	interface Props {
		messages: Array<Message>;
		isStreaming?: boolean;
	}

	let { messages, isStreaming = false }: Props = $props();

	function scrollToMe(message: BaseMessage): Attachment {
		return (element) => {
			if (message.text) {
				element.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		};
	}
</script>

<div class="flex h-screen flex-col">
	<div class="flex-1 overflow-y-auto pb-32">
		<div class="mx-auto w-full max-w-4xl px-4 py-8">
			{#each messages as message (message.id)}
				<div {@attach scrollToMe(message)}>
					{#if message.type === 'tool'}
						<ToolMessage message={message as ToolMessageType} />
					{:else}
						<ChatMessage message={message as BaseMessage} {isStreaming} />
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
