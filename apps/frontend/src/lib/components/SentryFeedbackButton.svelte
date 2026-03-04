<script lang="ts">
	import * as Sentry from '@sentry/sveltekit';
	import { Button } from '$lib/components/ui/button';
	import { MessageCircle } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let { class: className = '' } = $props();

	async function openFeedback() {
		const feedback = Sentry.getFeedback();
		if (feedback) {
			const form = await feedback.createForm();
			form.appendToDom();
			form.open();
		}
	}
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		<Button onclick={openFeedback} class={cn('', className)} variant="outline" size="sm">
			<MessageCircle size={16} />
		</Button>
	</Tooltip.Trigger>
	<Tooltip.Content>Send Feedback</Tooltip.Content>
</Tooltip.Root>
