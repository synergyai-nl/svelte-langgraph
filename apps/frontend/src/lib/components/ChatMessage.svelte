<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import { UserOutline } from 'flowbite-svelte-icons';
	import { Spinner } from 'flowbite-svelte';
	import type { BaseMessage } from '$lib/types/messageTypes';
	import Markdown from 'svelte-exmarkdown';
	import { gfmPlugin } from 'svelte-exmarkdown/gfm';

	interface Props {
		message: BaseMessage;
		isStreaming?: boolean;
	}

	let { message, isStreaming = false }: Props = $props();

	let isWaiting = $derived(message.type === 'ai' && !message.text && isStreaming);
	const plugins = [gfmPlugin()];
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
			{#if isWaiting}
				<Spinner />
			{:else if message.type === 'user'}
				<Card class="w-full max-w-none border-0 bg-gray-800 p-4 text-sm shadow-sm dark:bg-gray-700">
					<div class="prose prose-invert max-w-none leading-relaxed whitespace-pre-wrap">
						{message.text}
					</div>
				</Card>
			{:else}
				<Card
					class="w-full max-w-none border border-gray-200 bg-gray-50 p-4 text-sm shadow-sm dark:border-gray-600 dark:bg-gray-800"
				>
					<div class="prose prose-gray dark:prose-invert max-w-none leading-relaxed">
						<Markdown md={message.text} {plugins} />
					</div>
				</Card>
			{/if}
		</div>
	</div>
</div>
