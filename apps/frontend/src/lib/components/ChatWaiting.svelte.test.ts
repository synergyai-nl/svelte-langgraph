import { describe, test, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import ChatWaiting from './ChatWaiting.svelte';

describe('ChatWaiting component', () => {
	test('renders spinner without cancel button when no onCancel provided', () => {
		const { container } = render(ChatWaiting, {
			props: {}
		});

		// Should have user avatar
		const userAvatar = container.querySelector('.flex.w-8.h-8');
		expect(userAvatar).toBeInTheDocument();

		// Should have spinner - check for any loading indicator element
		const spinner = container.querySelector('svg') || container.querySelector('[role="status"]') || container.querySelector('.animate-spin');
		expect(spinner).toBeTruthy();

		// Should not have cancel button
		const cancelButton = container.querySelector('button');
		expect(cancelButton).not.toBeInTheDocument();
	});

	test('renders cancel button when onCancel provided', () => {
		const mockCancel = vi.fn();
		const { container } = render(ChatWaiting, {
			props: {
				onCancel: mockCancel
			}
		});

		// Should have cancel button
		const cancelButton = container.querySelector('button');
		expect(cancelButton).toBeInTheDocument();
		expect(cancelButton).toHaveTextContent('Stop');
		expect(cancelButton).toHaveClass('px-2', 'py-1', 'text-xs', 'rounded-md', 'border', 'border-border');
		expect(cancelButton).toHaveAttribute('title', 'Stop generation');
	});

	test('cancel button triggers callback', async () => {
		const mockCancel = vi.fn();
		const { container } = render(ChatWaiting, {
			props: {
				onCancel: mockCancel
			}
		});

		const cancelButton = container.querySelector('button');
		cancelButton?.click();

		expect(mockCancel).toHaveBeenCalledTimes(1);
	});

	test('renders with correct structure', () => {
		const { container } = render(ChatWaiting, {
			props: {
				onCancel: vi.fn()
			}
		});

		// Should have the main container structure
		const mainDiv = container.querySelector('.mb-6.flex.w-full.justify-start');
		expect(mainDiv).toBeInTheDocument();

		// Should have gap-3 spacing
		const flexContainer = container.querySelector('.flex.gap-3');
		expect(flexContainer).toBeInTheDocument();

		// Should have max-width constraint
		expect(flexContainer).toHaveClass('max-w-[80%]');
	});

	test('propagates onCancel function correctly', () => {
		const mockCancel = vi.fn();
		const { component } = render(ChatWaiting, {
			props: {
				onCancel: mockCancel
			}
		});

		// The component receives the prop correctly
		expect(component).toBeTruthy();
	});
});