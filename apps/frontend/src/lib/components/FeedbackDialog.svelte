<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		/** The rating being commented on, or null when the box is closed. */
		rating: 'up' | 'down' | null;
		/** Called for every way out of the box. `comment` is undefined unless the
		 *  user submitted one, but the rating is sent either way — see Chat. */
		onResolve: (comment?: string) => void;
	}

	let { rating, onResolve }: Props = $props();

	let comment = $state('');

	// Cleared here rather than from an effect watching `rating`: an effect can be
	// flushed again while the box is still open, which wipes what is being typed.
	function resolve(value?: string) {
		comment = '';
		onResolve(value);
	}

	// Fires for escape and click-away as well as the close button, which is why
	// nothing else needs to handle those separately.
	function handleOpenChange(open: boolean) {
		if (!open) resolve();
	}

	function submit() {
		const trimmed = comment.trim();
		resolve(trimmed || undefined);
	}
</script>

<Dialog.Root open={rating !== null} onOpenChange={handleOpenChange}>
	<Dialog.Content
		class="bg-card rounded-card-lg shadow-popover border"
		data-testid="feedback-dialog"
	>
		<Dialog.Header>
			<Dialog.Title>
				{rating === 'down'
					? m.message_feedback_dialog_title_negative()
					: m.message_feedback_dialog_title_positive()}
			</Dialog.Title>
		</Dialog.Header>

		<label class="text-foreground-alt text-sm" for="feedback-comment">
			{m.message_feedback_dialog_details()}
		</label>
		<Textarea
			id="feedback-comment"
			bind:value={comment}
			data-testid="feedback-comment"
			rows={4}
			placeholder={rating === 'down'
				? m.message_feedback_dialog_placeholder_negative()
				: m.message_feedback_dialog_placeholder_positive()}
		/>

		<Dialog.Footer>
			<Button variant="secondary" onclick={() => resolve()} data-testid="feedback-cancel">
				{m.message_feedback_dialog_cancel()}
			</Button>
			<Button onclick={submit} data-testid="feedback-submit">
				{m.message_feedback_dialog_submit()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
