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

	test('does not set aria-controls when collapsed, since the referenced region is unmounted', () => {
		render(ThinkingBlock, { props: { thinking: 'My reasoning here' } });
		const button = screen.getByRole('button', { name: /thinking/i });
		expect(button).not.toHaveAttribute('aria-controls');
	});

	test('expands to show thinking content when clicked', async () => {
		const user = userEvent.setup();
		render(ThinkingBlock, { props: { thinking: 'My reasoning here' } });

		const button = screen.getByRole('button', { name: /thinking/i });
		await user.click(button);

		expect(button).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByText('My reasoning here')).toBeInTheDocument();
	});

	test('sets aria-controls to the id of the visible thinking region when expanded', async () => {
		const user = userEvent.setup();
		render(ThinkingBlock, { props: { thinking: 'My reasoning here' } });

		const button = screen.getByRole('button', { name: /thinking/i });
		await user.click(button);

		const content = screen.getByText('My reasoning here');
		expect(button).toHaveAttribute('aria-controls', content.parentElement?.id);
		expect(content.parentElement?.id).toBeTruthy();
	});

	test('sets aria-expanded back to false when clicked a second time', async () => {
		const user = userEvent.setup();
		render(ThinkingBlock, { props: { thinking: 'My reasoning here' } });

		const button = screen.getByRole('button', { name: /thinking/i });
		await user.click(button);
		await user.click(button);

		expect(button).toHaveAttribute('aria-expanded', 'false');
	});

	describe('streaming animation', () => {
		test('defaults to inactive when active is omitted', () => {
			render(ThinkingBlock, { props: { thinking: 'My reasoning here' } });

			const button = screen.getByRole('button', { name: /thinking/i });
			expect(button).toHaveAttribute('data-streaming', 'false');
			expect(button.querySelector('svg')).not.toHaveClass('animate-pulse');
		});

		test('does not animate the icon when active is false', () => {
			render(ThinkingBlock, { props: { thinking: 'My reasoning here', active: false } });

			const button = screen.getByRole('button', { name: /thinking/i });
			expect(button).toHaveAttribute('data-streaming', 'false');
			expect(button.querySelector('svg')).not.toHaveClass('animate-pulse');
		});

		test('animates the icon and marks data-streaming when active is true', () => {
			render(ThinkingBlock, { props: { thinking: 'My reasoning here', active: true } });

			const button = screen.getByRole('button', { name: /thinking/i });
			expect(button).toHaveAttribute('data-streaming', 'true');
			expect(button.querySelector('svg')).toHaveClass('animate-pulse');
		});
	});
});
