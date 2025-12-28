<script lang="ts">
	import * as Card from '$lib/components/ui/card';
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
			class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10"
		>
			<CircleAlert size={20} class="text-destructive" />
		</div>
		<div class="relative w-full">
			<Card.Root
				class="w-full max-w-none border border-destructive/20 bg-destructive/5 shadow-sm"
			>
				<Card.Content class="p-4">
					<div class="space-y-3">
						<p class="text-sm text-foreground">
							{error.message}
						</p>
						<div class="flex gap-2 pt-1">
							<Button variant="outline" size="sm" onclick={() => onRetry()}>
								<RefreshCw size={16} />
								{m.chat_error_retry()}
							</Button>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
