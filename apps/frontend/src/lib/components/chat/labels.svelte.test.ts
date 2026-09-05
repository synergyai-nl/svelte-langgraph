import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { resolveLabels } from './labels.js';
import LangGraphHost from './__tests__/LangGraphHost.svelte';
import { makeContext } from './__tests__/testContext.js';
import Composer from './Composer.svelte';
import AIMessageActions from './AIMessageActions.svelte';
import { anAIMessage } from '../__tests__/fixtures.js';

describe('resolveLabels', () => {
	const defaults = { copy: 'Copy to clipboard', copied: 'Copied' };

	test('with no context and no prop, returns the defaults', () => {
		expect(resolveLabels(defaults, undefined, undefined)).toEqual(defaults);
	});

	test('a context partial overrides the matching default keys', () => {
		expect(resolveLabels(defaults, { copy: 'Kopieren' }, undefined)).toEqual({
			copy: 'Kopieren',
			copied: 'Copied'
		});
	});

	test('a prop partial wins over a context partial for the same key', () => {
		expect(resolveLabels(defaults, { copy: 'Kopieren' }, { copy: 'Copier' })).toEqual({
			copy: 'Copier',
			copied: 'Copied'
		});
	});

	// Regression test for ada38ce ("Drop explicitly-undefined keys when resolving labels"): a
	// partial built from a conditional value (e.g. `{ copy: maybeString }` where `maybeString` is
	// `undefined`) must fall back to the default, not blank the label.
	test('a key explicitly set to undefined in the context partial falls back to the default', () => {
		expect(resolveLabels(defaults, { copy: undefined }, undefined)).toEqual(defaults);
	});

	test('a key explicitly set to undefined in the prop partial falls back to the default (not to context)', () => {
		expect(resolveLabels(defaults, { copy: 'Kopieren' }, { copy: undefined })).toEqual({
			copy: 'Kopieren',
			copied: 'Copied'
		});
	});
});

describe('label precedence end-to-end', () => {
	describe('Composer placeholder', () => {
		test('bare (no provider, no labels prop) uses the English default', () => {
			render(LangGraphHost, { props: { component: Composer, value: '', onSubmit: () => {} } });
			expect(screen.getByPlaceholderText('Ask your agent…')).toBeInTheDocument();
		});

		test('under <LangGraph labels={...}> (context) uses the context value', () => {
			const ctx = makeContext({
				labels: { composer: { placeholder: 'Fragen Sie Ihren Agenten…' } }
			});
			render(LangGraphHost, {
				props: { ctx, component: Composer, value: '', onSubmit: () => {} }
			});
			expect(screen.getByPlaceholderText('Fragen Sie Ihren Agenten…')).toBeInTheDocument();
		});

		test('its own labels prop under the provider wins over the context value', () => {
			const ctx = makeContext({
				labels: { composer: { placeholder: 'Fragen Sie Ihren Agenten…' } }
			});
			render(LangGraphHost, {
				props: {
					ctx,
					component: Composer,
					value: '',
					onSubmit: () => {},
					labels: { placeholder: 'Demandez à votre agent…' }
				}
			});
			expect(screen.getByPlaceholderText('Demandez à votre agent…')).toBeInTheDocument();
		});

		test('a context key explicitly set to undefined falls back to the default', () => {
			const ctx = makeContext({ labels: { composer: { placeholder: undefined } } });
			render(LangGraphHost, {
				props: { ctx, component: Composer, value: '', onSubmit: () => {} }
			});
			expect(screen.getByPlaceholderText('Ask your agent…')).toBeInTheDocument();
		});
	});

	describe('AIMessageActions regenerate label', () => {
		const message = anAIMessage();

		test('bare uses the English default', () => {
			render(LangGraphHost, {
				props: { component: AIMessageActions, message, isHovered: true, onRegenerate: () => {} }
			});
			expect(screen.getByTitle('Regenerate')).toBeInTheDocument();
		});

		test('under the provider uses the context value', () => {
			const ctx = makeContext({ labels: { aiActions: { regenerate: 'Regénérer' } } });
			render(LangGraphHost, {
				props: {
					ctx,
					component: AIMessageActions,
					message,
					isHovered: true,
					onRegenerate: () => {}
				}
			});
			expect(screen.getByTitle('Regénérer')).toBeInTheDocument();
		});

		test('its own labels prop wins over the context value', () => {
			const ctx = makeContext({ labels: { aiActions: { regenerate: 'Regénérer' } } });
			render(LangGraphHost, {
				props: {
					ctx,
					component: AIMessageActions,
					message,
					isHovered: true,
					onRegenerate: () => {},
					labels: { regenerate: 'Regenerar' }
				}
			});
			expect(screen.getByTitle('Regenerar')).toBeInTheDocument();
		});
	});
});
