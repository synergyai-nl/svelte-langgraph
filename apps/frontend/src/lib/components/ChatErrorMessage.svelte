<script lang="ts">
	import { Card, Button } from 'flowbite-svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { CircleAlert, RotateCw } from 'lucide-svelte';

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
			<CircleAlert class="h-4 w-4 text-rose-600 dark:text-rose-500" />
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
						<Button size="sm" color="dark" outline onclick={onRetry}>
							<RotateCw class="me-2 h-4 w-4" />
							{m.chat_error_retry()}
						</Button>
					</div>
				</div>
			</Card>
		</div>
	</div>
</div>
