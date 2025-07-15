<script lang="ts">
	interface ToolMessage {
		type: 'tool';
		text: string;
		tool_name: string;
		payload?: any;
		collapsed?: boolean;
	}

	interface Props {
		message: ToolMessage;
		scrollToMe: (node: HTMLElement) => { destroy: () => void };
	}

	let { message, scrollToMe }: Props = $props();
</script>

<div class="mb-2 flex justify-start" use:scrollToMe>
	<div class="flex items-start gap-3 w-full max-w-[80%]">
		<div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-500 dark:bg-gray-400 flex items-center justify-center">
			<span class="text-white dark:text-gray-900 text-xs">🛠️</span>
		</div>
		<div class="relative">
			<div
				class="cursor-pointer inline-flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
				onclick={() => message.collapsed = !message.collapsed}
			>
				<span class="text-gray-600 dark:text-gray-400">{message.text}</span>
				<span class="text-xs font-mono text-gray-500 dark:text-gray-400">{message.tool_name}</span>
				<svg
					class="w-3 h-3 transition-transform duration-200"
					style="transform: {message.collapsed ? 'rotate(-90deg)' : ''};"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
				</svg>
			</div>
			{#if !message.collapsed}
				<div class="mt-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
					<div class="text-gray-600 dark:text-gray-400 mb-1">
						<span class="font-medium">Tool:</span> {message.tool_name}
					</div>
					{#if message.payload && Object.keys(message.payload).length > 0}
						<div class="mt-1 text-gray-700 dark:text-gray-300">
							<span class="font-medium">Parameters:</span>
							<pre class="mt-1 overflow-x-auto bg-gray-100 dark:bg-gray-700 p-2 rounded text-xs">{JSON.stringify(message.payload, null, 2)}</pre>
						</div>
					{:else}
						<div class="mt-1 text-gray-500 dark:text-gray-400 italic">No parameters</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>