<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { User } from '@lucide/svelte';
	import type { BaseMessage } from '$lib/langgraph/types';
	import Markdown from 'svelte-exmarkdown';
	import { gfmPlugin } from 'svelte-exmarkdown/gfm';
	import AIMessageActions from './AIMessageActions.svelte';
	import UserMessageActions from './UserMessageActions.svelte';

	interface Props {
		message: BaseMessage;
		onEdit?: (message: BaseMessage) => void;
		onRegenerate?: (message: BaseMessage) => void;
		onFeedback?: (message: BaseMessage, type: 'up' | 'down') => void;
	}

	let { message, onEdit, onRegenerate, onFeedback }: Props = $props();

	const plugins = [gfmPlugin()];

	let isHovered = $state(false);
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
			<div
				role="group"
				onmouseenter={() => (isHovered = true)}
				onmouseleave={() => (isHovered = false)}
				class="relative w-full"
			>
				{#if message.type === 'ai'}
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
					<UserMessageActions {message} {isHovered} {onEdit} />
				{/if}
			</div>
		</div>
	</div>
</div>
