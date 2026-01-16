<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import { Button } from '$lib/components/ui/button';
	import { CircleAlert, RefreshCw } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		error: Error;
		onRetry: () => void;
	}

	let { error, onRetry }: Props = $props();
</script>

<div class="mb-6 flex w-full justify-start">
	<div class="flex max-w-[80%] items-start gap-3">
		<div
			class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950"
		>
			<CircleAlert size={20} class="text-rose-600 dark:text-rose-500" />
		</div>
		<div class="relative w-full">
			<Card
				class="w-full max-w-none border border-rose-200 bg-rose-50 p-4 text-sm shadow-sm dark:border-rose-900 dark:bg-rose-950/30"
			>
				<div class="space-y-3">
					<p class="text-sm text-gray-800 dark:text-gray-300">
						{error.message}
					</p>
					<div class="flex gap-2 pt-1">
						<Button variant="outline" size="sm" onclick={() => onRetry()}>
							<RefreshCw size={16} />
							{m.chat_error_retry()}
						</Button>
					</div>
				</div>
			</Card>
		</div>
	</div>
</div>
