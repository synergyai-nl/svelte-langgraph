import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import FeedbackDialog from './FeedbackDialog.svelte';

describe('probe', () => {
	test('typing into the dialog textarea in isolation', async () => {
		const user = userEvent.setup();
		render(FeedbackDialog, { props: { rating: 'up', onResolve: vi.fn() } });
		const box = await screen.findByTestId('feedback-comment');
		await user.click(box);
		await user.type(box, 'hello world');
		console.log('PROBE_ISOLATED_VALUE:', JSON.stringify((box as HTMLTextAreaElement).value));
		console.log('PROBE_ACTIVE:', document.activeElement?.getAttribute('data-testid'));
		expect(true).toBe(true);
	});
});
