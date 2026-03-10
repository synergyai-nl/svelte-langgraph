import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ThinkingBlock from './ThinkingBlock.svelte';

describe('ThinkingBlock', () => {
	test('renders the toggle button collapsed by default', () => {
		render(ThinkingBlock, { props: { thinking: 'My reasoning here' } });
		const button = screen.getByRole('button', { name: /thinking/i });
		expect(button).toBeInTheDocument();
		expect(button).toHaveAttribute('aria-expanded', 'false');
	});

	test('does not show thinking content when collapsed', () => {
		render(ThinkingBlock, { props: { thinking: 'My reasoning here' } });
		expect(screen.queryByText('My reasoning here')).not.toBeInTheDocument();
	});

	test('expands to show thinking content when clicked', async () => {
		const user = userEvent.setup();
		render(ThinkingBlock, { props: { thinking: 'My reasoning here' } });

		const button = screen.getByRole('button', { name: /thinking/i });
		await user.click(button);

		expect(button).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByText('My reasoning here')).toBeInTheDocument();
	});

	test('sets aria-expanded back to false when clicked a second time', async () => {
		const user = userEvent.setup();
		render(ThinkingBlock, { props: { thinking: 'My reasoning here' } });

		const button = screen.getByRole('button', { name: /thinking/i });
		await user.click(button);
		await user.click(button);

		expect(button).toHaveAttribute('aria-expanded', 'false');
	});
});
