<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { CircleAlert, RefreshCw } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';

	// Takes no error: the raw text (e.g. `HTTP 401 {...}`) is for developers, and the stream
	// already logs it to the console. The reader gets a localized generic text.
	interface Props {
		/** Shows a Retry button when given; without it the card only reports the error. */
		onRetry?: () => void;
	}

	let { onRetry }: Props = $props();
</script>

<div class="mb-6 flex w-full justify-start" data-testid="chat-error">
	<div class="flex max-w-[80%] items-start gap-3">
		<div
			class="bg-destructive/10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
		>
			<CircleAlert size={20} class="text-destructive" />
		</div>
		<div class="relative w-full">
			<Card.Root class="border-destructive/20 bg-destructive/5 w-full max-w-none border shadow-sm">
				<Card.Content class="p-4">
					<div class="space-y-3">
						<p class="text-foreground text-sm">
							{m.slg_error_generic()}
						</p>
						{#if onRetry}
							<div class="flex gap-2 pt-1">
								<Button variant="outline" size="sm" onclick={() => onRetry?.()}>
									<RefreshCw size={16} />
									{m.slg_chat_error_retry()}
								</Button>
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
