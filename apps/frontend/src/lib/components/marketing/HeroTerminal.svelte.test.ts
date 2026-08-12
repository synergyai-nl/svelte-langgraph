import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import HeroTerminal from './HeroTerminal.svelte';

describe('HeroTerminal', () => {
	test('renders the terminal chrome label', () => {
		render(HeroTerminal);

		expect(screen.getByText('terminal')).toBeInTheDocument();
	});

	test('renders the documented setup commands in order', () => {
		render(HeroTerminal);

		const body = screen.getByTestId('hero-terminal-body');
		const lines = within(body)
			.getAllByText(/^\$/)
			.map((el) => el.parentElement?.textContent?.replace(/\s+/g, ' ').trim());

		expect(lines).toEqual(['$ proto install', '$ cp .env.example .env', '$ moon :dev :oidc-mock']);
	});

	test('renders the ready line naming all three dev services', () => {
		render(HeroTerminal);

		expect(
			screen.getByText(/Ready — frontend, backend, and OIDC mock running/)
		).toBeInTheDocument();
	});

	test('exposes the body via a test id so callers can scope queries', () => {
		render(HeroTerminal);

		// E2E scopes "proto install" here — the phrase also appears in the page's prose.
		expect(screen.getByTestId('hero-terminal-body')).toBeInTheDocument();
	});

	test('applies a caller-supplied class alongside its own', () => {
		const { container } = render(HeroTerminal, { class: 'custom-shadow' });

		const root = container.querySelector('div');
		expect(root).toHaveClass('custom-shadow');
		expect(root).toHaveClass('rounded-xl');
	});
});
