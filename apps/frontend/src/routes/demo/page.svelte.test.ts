import { describe, expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import { m } from '$lib/paraglide/messages.js';
import DemoPage from './+page.svelte';

describe('/demo', () => {
	test('has one page heading and named availability sections', () => {
		render(DemoPage);

		expect(document.title).toBe(m.demo_page_title());
		expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(m.demo_heading());
		expect(
			screen.getByRole('heading', { level: 2, name: m.demo_available_now() })
		).toBeInTheDocument();
		expect(
			screen.getByRole('heading', { level: 2, name: m.demo_coming_next() })
		).toBeInTheDocument();
	});

	test('links both available demos and exposes their actions', () => {
		render(DemoPage);
		const actions = screen.getAllByRole('link', { name: m.demo_open() });

		expect(actions).toHaveLength(2);
		expect(actions[0]).toHaveAttribute('href', '/chat');
		expect(actions[1]).toHaveAttribute('href', '/demo/embedded');
		expect(screen.getAllByText(m.demo_status_available())).toHaveLength(2);
	});

	test('renders coming-soon cards without interactive destinations', () => {
		render(DemoPage);
		const section = screen.getByRole('heading', {
			level: 2,
			name: m.demo_coming_next()
		}).parentElement!;
		const comingSoon = within(section);

		expect(comingSoon.getAllByText(m.demo_status_coming_soon())).toHaveLength(3);
		expect(comingSoon.queryByRole('link')).not.toBeInTheDocument();
		expect(comingSoon.queryByRole('button')).not.toBeInTheDocument();
		expect(section.querySelector('[href]')).toBeNull();
	});
});
