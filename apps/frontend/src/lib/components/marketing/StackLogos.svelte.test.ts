import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StackLogos from './StackLogos.svelte';

describe('StackLogos', () => {
	test('renders both stack logos with accessible names', () => {
		render(StackLogos);

		expect(screen.getByAltText('Svelte')).toBeInTheDocument();
		expect(screen.getByAltText('LangGraph')).toBeInTheDocument();
	});

	test('points each logo at its static asset', () => {
		render(StackLogos);

		expect(screen.getByAltText('Svelte')).toHaveAttribute('src', '/logos/svelte.svg');
		expect(screen.getByAltText('LangGraph')).toHaveAttribute('src', '/logos/langgraph.svg');
	});

	test('hides the decorative separator from assistive tech', () => {
		render(StackLogos);

		// The "+" between the logos carries no meaning for screen readers.
		expect(screen.getByText('+')).toHaveAttribute('aria-hidden', 'true');
	});

	test('applies a caller-supplied class alongside its own', () => {
		const { container } = render(StackLogos, { class: 'custom-spacing' });

		const root = container.querySelector('div');
		expect(root).toHaveClass('custom-spacing');
		expect(root).toHaveClass('py-8');
	});
});
