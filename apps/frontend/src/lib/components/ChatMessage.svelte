<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { User } from '@lucide/svelte';
	import type { BaseMessage } from '@langchain/core/messages';
	import Markdown from 'svelte-exmarkdown';
	import { gfmPlugin } from 'svelte-exmarkdown/gfm';
	import AIMessageActions from './AIMessageActions.svelte';
	import UserMessageActions from './UserMessageActions.svelte';

	interface Props {
		message: BaseMessage;
		isLoading?: boolean;
		onEditSave?: (messageId: string, newText: string) => void;
	}

	let { message, isLoading = false, onEditSave }: Props = $props();

	const plugins = [gfmPlugin()];

	function getContent(msg: BaseMessage): string {
		return typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
	}

	let isHovered = $state(false);
	let isEditing = $state(false);
	let editText = $state(getContent(message));
</script>

<div
	class="mb-6 w-full {message.getType() === 'human' ? 'flex justify-end' : 'flex justify-start'}"
>
	<div
		class="flex items-start gap-3 {message.getType() === 'human'
			? 'max-w-[70%] flex-row-reverse'
			: 'max-w-[80%]'}"
	>
		<div class="bg-muted mt-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full">
			<User size={20} class="text-foreground" />
		</div>
		<div class="relative w-full">
			<div
				role="group"
				onmouseenter={() => (isHovered = true)}
				onmouseleave={() => (isHovered = false)}
				class="relative w-full"
			>
				{#if message.getType() === 'ai'}
					<Card.Root class="border-border-card bg-muted border shadow-sm">
						<Card.Content class="prose prose-gray dark:prose-invert max-w-none text-sm">
							<Markdown md={getContent(message)} {plugins} />
						</Card.Content>
					</Card.Root>
					<AIMessageActions {message} {isHovered} />
				{:else if isEditing}
					<div class="w-full space-y-2">
						<Textarea bind:value={editText} class="min-h-24 text-sm" />
						<div class="flex justify-end gap-2">
							<Button
								size="sm"
								variant="outline"
								onclick={() => {
									isEditing = false;
									editText = getContent(message);
								}}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								onclick={() => {
									if (onEditSave && editText.trim() && message.id) {
										onEditSave(message.id, editText);
										isEditing = false;
									}
								}}
							>
								Save & Rerun
							</Button>
						</div>
					</div>
				{:else}
					<Card.Root class="bg-foreground border-0 shadow-sm">
						<Card.Content
							class="prose prose-invert text-background max-w-none text-sm whitespace-pre-wrap"
						>
							{getContent(message)}
						</Card.Content>
					</Card.Root>
					<UserMessageActions
						{isHovered}
						{isLoading}
						onEdit={() => {
							isEditing = true;
							editText = getContent(message);
						}}
					/>
				{/if}
			</div>
		</div>
	</div>
</div>
