import { render } from '@testing-library/svelte';
import TestProviders from './TestProviders.svelte';
import type { Component } from 'svelte';

/**
 * Renders a component wrapped with all necessary context providers (Tooltip.Provider, etc.).
 * Use this instead of `render()` for components that depend on app-level context.
 */

export function renderWithProviders(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	component: Component<any>,
	props: Record<string, unknown> = {}
) {
	return render(TestProviders, {
		props: {
			component,
			props
		}
	});
}
