<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import type { BaseMessage } from '$lib/langgraph/types';
	import Markdown from 'svelte-exmarkdown';
	import { gfmPlugin } from 'svelte-exmarkdown/gfm';
	import AIMessageActions from './AIMessageActions.svelte';
	import UserMessageActions from './UserMessageActions.svelte';
	import { User } from 'lucide-svelte';

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
		<div
			class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 dark:bg-gray-400"
		>
			<User class="h-4 w-4 text-white dark:text-gray-900" />
		</div>
		<div class="relative w-full">
			<div
				role="group"
				onmouseenter={() => (isHovered = true)}
				onmouseleave={() => (isHovered = false)}
				class="relative pb-10"
			>
				{#if message.type === 'ai'}
					<Card
						class="w-full max-w-none border border-gray-200 bg-gray-50 p-4 text-sm shadow-sm dark:border-gray-600 dark:bg-gray-800"
					>
						<div class="prose prose-gray dark:prose-invert max-w-none leading-relaxed">
							<Markdown md={message.text} {plugins} />
						</div>
					</Card>
					<AIMessageActions {message} {isHovered} {onRegenerate} {onFeedback} />
				{:else}
					<Card
						class="w-full max-w-none border-0 bg-gray-800 p-4 text-sm shadow-sm dark:bg-gray-700"
					>
						<div class="prose prose-invert max-w-none leading-relaxed whitespace-pre-wrap">
							{message.text}
						</div>
					</Card>
					<UserMessageActions {message} {isHovered} {onEdit} />
				{/if}
			</div>
		</div>
	</div>
</div>
