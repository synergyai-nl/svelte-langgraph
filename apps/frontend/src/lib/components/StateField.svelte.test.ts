import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { tick } from 'svelte';
import StateField from './StateField.svelte';
import type { FieldBinding } from '$lib/langgraph/stateSync.svelte.js';

/**
 * Build a minimal FieldBinding test double.
 * All properties are implemented as plain getters backed by a mutable object.
 */
function makeEnumBinding(
	options: string[],
	currentValue: string | undefined = undefined
): FieldBinding & { currentValue: string | undefined; submit: ReturnType<typeof vi.fn> } {
	const submit = vi.fn();
	const state = { currentValue };

	return {
		get value() {
			return state.currentValue;
		},
		get schema() {
			return { kind: 'enum' as const, options };
		},
		get options() {
			return options;
		},
		set(v: unknown) {
			state.currentValue = v as string;
			submit(v);
		},
		// expose internals for assertions
		get currentValue() {
			return state.currentValue;
		},
		submit
	};
}

function makeLoadingBinding(): FieldBinding {
	return {
		get value() {
			return undefined;
		},
		get schema() {
			return undefined;
		},
		get options() {
			return [];
		},
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		set(_v: unknown) {}
	};
}

function makeUnavailableBinding(): FieldBinding {
	return makeLoadingBinding();
}

function makeBooleanBinding(current = false): FieldBinding {
	const state = { current };
	const submit = vi.fn();
	return {
		get value() {
			return state.current;
		},
		get schema() {
			return { kind: 'boolean' as const };
		},
		get options() {
			return [];
		},
		set(v: unknown) {
			state.current = v as boolean;
			submit(v);
		}
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('StateField', () => {
	describe('enum kind', () => {
		it('renders a select with the correct options', () => {
			const field = makeEnumBinding(['research', 'draft', 'review'], 'draft');
			render(StateField, { name: 'phase', field });

			const select = screen.getByRole('combobox');
			expect(select).toBeInTheDocument();

			const options = screen.getAllByRole('option');
			const optionValues = options.map((o) => o.getAttribute('value'));
			expect(optionValues).toContain('research');
			expect(optionValues).toContain('draft');
			expect(optionValues).toContain('review');
		});

		it('shows the placeholder option when value is undefined', () => {
			const field = makeEnumBinding(['research', 'draft', 'review'], undefined);
			render(StateField, { name: 'phase', field });

			// Placeholder option with text "—" should be present
			expect(screen.getByRole('option', { name: '—' })).toBeInTheDocument();
		});

		it('does not show the placeholder option when a value is set', () => {
			const field = makeEnumBinding(['research', 'draft', 'review'], 'draft');
			render(StateField, { name: 'phase', field });

			expect(screen.queryByRole('option', { name: '—' })).not.toBeInTheDocument();
		});

		it('marks the current option as selected', () => {
			const field = makeEnumBinding(['research', 'draft', 'review'], 'review');
			render(StateField, { name: 'phase', field });

			const selectedOption = screen.getByRole('option', { name: 'review' }) as HTMLOptionElement;
			expect(selectedOption.selected).toBe(true);
		});

		it('calls field.set when an option is selected', async () => {
			const user = userEvent.setup();
			const field = makeEnumBinding(['research', 'draft', 'review'], 'research');
			const setSpy = vi.spyOn(field, 'set');
			render(StateField, { name: 'phase', field });

			const select = screen.getByRole('combobox');
			await user.selectOptions(select, 'draft');

			expect(setSpy).toHaveBeenCalledWith('draft');
		});

		it('has accessible name equal to the label prop', () => {
			const field = makeEnumBinding(['a', 'b'], 'a');
			render(StateField, { name: 'phase', field, label: 'Phase' });

			expect(screen.getByLabelText('Phase')).toBeInTheDocument();
		});

		it('falls back to name as accessible label when no label prop', () => {
			const field = makeEnumBinding(['a', 'b'], 'a');
			render(StateField, { name: 'phase', field });

			expect(screen.getByLabelText('phase')).toBeInTheDocument();
		});

		it('renders the wrapper with data-testid="state-field-{name}"', () => {
			const field = makeEnumBinding(['a', 'b'], 'a');
			render(StateField, { name: 'phase', field });

			expect(document.querySelector('[data-testid="state-field-phase"]')).toBeInTheDocument();
		});

		it('follows programmatic value changes even after user interaction', async () => {
			// Reactive double: mirrors field.value being backed by stream.values.
			// Guards against the option-dirty-flag trap — once the user has picked an
			// option, browsers ignore `selected` attribute changes on it, so the select
			// must be driven via its value binding instead.
			const user = userEvent.setup();
			const submit = vi.fn();
			const state = $state<{ current: string | undefined }>({ current: 'research' });
			const field: FieldBinding = {
				get value() {
					return state.current;
				},
				get schema() {
					return { kind: 'enum' as const, options: ['research', 'draft', 'review'] };
				},
				get options() {
					return ['research', 'draft', 'review'];
				},
				set(v: unknown) {
					state.current = v as string;
					submit(v);
				}
			};
			render(StateField, { name: 'phase', field });

			const select = screen.getByRole('combobox') as HTMLSelectElement;

			// User interaction sets the dirty flag on the 'draft' option
			await user.selectOptions(select, 'draft');
			expect(select.value).toBe('draft');

			// AI/server-driven change arrives via stream.values
			state.current = 'review';
			await tick();
			expect(select.value).toBe('review');

			// Change back to the previously-user-selected option (the dirty one)
			state.current = 'draft';
			await tick();
			expect(select.value).toBe('draft');
		});
	});

	describe('boolean kind', () => {
		it('renders a checkbox', () => {
			const field = makeBooleanBinding(false);
			render(StateField, { name: 'enabled', field });

			expect(screen.getByRole('checkbox')).toBeInTheDocument();
		});

		it('calls field.set with true when checkbox is checked', async () => {
			const user = userEvent.setup();
			const field = makeBooleanBinding(false);
			const setSpy = vi.spyOn(field, 'set');
			render(StateField, { name: 'enabled', field });

			await user.click(screen.getByRole('checkbox'));

			expect(setSpy).toHaveBeenCalledWith(true);
		});
	});

	describe('schema unavailable / loading', () => {
		it('renders nothing while schema is loading', () => {
			const field = makeLoadingBinding();
			render(StateField, { name: 'phase', field });

			expect(document.querySelector('[data-testid="state-field-phase"]')).not.toBeInTheDocument();
		});

		it('renders nothing when schema is unavailable', () => {
			const field = makeUnavailableBinding();
			render(StateField, { name: 'phase', field });

			expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
			expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
		});
	});
});
