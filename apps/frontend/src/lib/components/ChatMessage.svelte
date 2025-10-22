<script lang="ts">
	import { Card, Button } from 'flowbite-svelte';
	import {
		UserOutline,
		PenOutline,
		ClipboardOutline,
		ArrowsRepeatOutline
	} from 'flowbite-svelte-icons';
	import type { BaseMessage } from '$lib/langgraph/types';
	import Markdown from 'svelte-exmarkdown';
	import { gfmPlugin } from 'svelte-exmarkdown/gfm';
	import * as m from '$lib/paraglide/messages.js';
	import FeedbackButtons from './FeedbackButtons.svelte';

	interface Props {
		message: BaseMessage;
		onEdit?: (message: BaseMessage) => void;
		onRegenerate?: (message: BaseMessage) => void;
		onFeedback?: (message: BaseMessage, type: 'up' | 'down') => void;
	}

	let { message, onEdit, onRegenerate, onFeedback }: Props = $props();

	const plugins = [gfmPlugin()];

	let isHovered = $state(false);

	function handleCopy() {
		navigator.clipboard.writeText(message.text);
	}
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
			<UserOutline size="sm" class="text-white dark:text-gray-900" />
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

					<!-- AI Message Actions -->
					<div
						class="absolute bottom-2 left-0 flex items-center gap-2 transition-all duration-300 ease-in-out"
						style="opacity: {isHovered ? '1' : '0'}; transform: translateY({isHovered
							? '0'
							: '-4px'});"
					>
						<Button
							onclick={handleCopy}
							class="p-1.5!"
							color="alternative"
							size="xs"
							title={m.message_copy()}
							disabled
						>
							<ClipboardOutline size="xs" />
						</Button>
						<Button
							onclick={() => onRegenerate?.(message)}
							class="p-1.5!"
							color="alternative"
							size="xs"
							title={m.message_regenerate()}
							disabled
						>
							<ArrowsRepeatOutline size="xs" />
						</Button>
						<FeedbackButtons {message} {onFeedback} />
					</div>
				{:else}
					<Card
						class="w-full max-w-none border-0 bg-gray-800 p-4 text-sm shadow-sm dark:bg-gray-700"
					>
						<div class="prose prose-invert max-w-none leading-relaxed whitespace-pre-wrap">
							{message.text}
						</div>
					</Card>

					<!-- User Message Actions -->
					<div
						class="absolute right-0 bottom-2 flex items-center gap-2 transition-all duration-300 ease-in-out"
						style="opacity: {isHovered ? '1' : '0'}; transform: translateY({isHovered
							? '0'
							: '-4px'});"
					>
						<Button
							onclick={() => onEdit?.(message)}
							class="p-1.5!"
							color="alternative"
							size="xs"
							title={m.message_edit()}
							disabled
						>
							<PenOutline size="xs" />
						</Button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
