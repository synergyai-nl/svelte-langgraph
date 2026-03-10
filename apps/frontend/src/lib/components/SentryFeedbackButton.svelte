<script lang="ts">
	import * as Sentry from '@sentry/sveltekit';
	import { env } from '$env/dynamic/public';
	import { Button } from '$lib/components/ui/button';
	import { MessageCircleHeart } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let { class: className = '' } = $props();
	const dsn = env.PUBLIC_SENTRY_DSN;

	async function openFeedback() {
		const feedback = Sentry.getFeedback();
		if (feedback) {
			const form = await feedback.createForm();
			form.appendToDom();
			form.open();
		}
	}
</script>

{#if dsn}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					onclick={openFeedback}
					class={cn('', className)}
					variant="outline"
					size="sm"
				>
					<MessageCircleHeart size={16} />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Send Feedback</Tooltip.Content>
	</Tooltip.Root>
{/if}
