<script lang="ts">
	import type { ToolMessage } from '$lib/types/messageTypes';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		message: ToolMessage;
	}

	let { message }: Props = $props();
</script>

<div class="mb-2 flex justify-start">
	<div class="flex w-full max-w-[80%] items-start gap-3">
		<div
			class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 dark:bg-gray-400"
		>
			<span class="text-xs text-white dark:text-gray-900">🛠️</span>
		</div>
		<div class="relative">
			<button
				type="button"
				aria-expanded={!message.collapsed}
				class="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-200 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:outline-none dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
				onclick={() => (message.collapsed = !message.collapsed)}
			>
				<span class="text-gray-600 dark:text-gray-400">{message.text}</span>
				<span class="font-mono text-xs text-gray-500 dark:text-gray-400">{message.tool_name}</span>
				<svg
					class="h-3 w-3 transition-transform duration-200"
					style="transform: {message.collapsed ? 'rotate(-90deg)' : ''};"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path
						fill-rule="evenodd"
						d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>

			{#if !message.collapsed}
				<div
					class="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800"
				>
					<div class="mb-1 text-gray-600 dark:text-gray-400">
						<span class="font-medium">{m.tool_label()}</span>
						{message.tool_name}
					</div>
					{#if message.payload && Object.keys(message.payload).length > 0}
						<div class="mt-1 text-gray-700 dark:text-gray-300">
							<span class="font-medium">{m.tool_parameters()}</span>
							<pre
								class="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-700">{JSON.stringify(
									message.payload,
									null,
									2
								)}</pre>
						</div>
					{:else}
						<div class="mt-1 text-gray-500 italic dark:text-gray-400">{m.tool_no_parameters()}</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
