<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { User } from '@lucide/svelte';
	import type { Message } from '$lib/langgraph/types';
	import Markdown from 'svelte-exmarkdown';
	import { gfmPlugin } from 'svelte-exmarkdown/gfm';
	import AIMessageActions from './AIMessageActions.svelte';
	import UserMessageActions from './UserMessageActions.svelte';
	import UserMessageEdit from './UserMessageEdit.svelte';
	import ThinkingBlock from './ThinkingBlock.svelte';

	interface Props {
		message: Message;
		onEdit: (message: Message, newText: string) => boolean;
		onRegenerate: (message: Message) => void;
		onFeedback?: (message: Message, type: 'up' | 'down') => void;
	}

	let { message, onEdit, onRegenerate, onFeedback }: Props = $props();

	const plugins = [gfmPlugin()];

	let isHovered = $state(false);
	let isEditing = $state(false);
	let editText = $state('');

	function startEditing() {
		editText = message.text;
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
	}

	function confirmEdit() {
		if (editText.trim() && editText !== message.text) {
			// Only close the editor if the edit was accepted (rejected when a run is streaming)
			if (onEdit(message, editText)) {
				isEditing = false;
			}
		} else {
			isEditing = false;
		}
	}
</script>

<div class="mb-6 w-full {message.type === 'user' ? 'flex justify-end' : 'flex justify-start'}">
	<div
		class="flex items-start gap-3 {message.type === 'user'
			? 'max-w-[70%] flex-row-reverse'
			: 'max-w-[80%]'}"
	>
		<div class="bg-muted mt-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full">
			<User size={20} class="text-foreground" />
		</div>
		<div class="relative w-full">
			{#if message.type === 'user' && isEditing}
				<UserMessageEdit bind:value={editText} onConfirm={confirmEdit} onCancel={cancelEditing} />
			{:else}
				<div
					role="group"
					onmouseenter={() => (isHovered = true)}
					onmouseleave={() => (isHovered = false)}
					class="relative w-full"
				>
					{#if message.type === 'ai'}
						{#if message.thinking}
							<ThinkingBlock thinking={message.thinking} />
						{/if}
						<Card.Root class="border-border-card bg-muted border shadow-sm">
							<Card.Content class="prose prose-gray dark:prose-invert max-w-none text-sm">
								<Markdown md={message.text} {plugins} />
							</Card.Content>
						</Card.Root>
						<AIMessageActions {message} {isHovered} {onRegenerate} {onFeedback} />
					{:else}
						<Card.Root class="bg-foreground border-0 shadow-sm">
							<Card.Content
								class="prose prose-invert text-background max-w-none text-sm whitespace-pre-wrap"
							>
								{message.text}
							</Card.Content>
						</Card.Root>
						<UserMessageActions {isHovered} onEdit={startEditing} />
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
