import { render } from '@testing-library/svelte';
import TestProviders from './TestProviders.svelte';
import type { Component } from 'svelte';

/**
 * Renders a component wrapped with all necessary context providers (Tooltip.Provider, etc.).
 * Use this instead of `render()` for components that depend on app-level context.
 */

export function renderWithProviders(
	component: Component<Record<string, unknown>>,
	props: Record<string, unknown> = {}
) {
	return render(TestProviders, {
		props: {
			component,
			props
		}
	});
}
