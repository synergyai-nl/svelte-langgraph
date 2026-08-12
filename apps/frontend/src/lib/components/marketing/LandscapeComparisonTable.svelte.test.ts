import { describe, test, expect } from 'vitest';
import { screen } from '@testing-library/svelte';
import { render } from '@testing-library/svelte';
import LandscapeComparisonTable, { type ComparisonRow } from './LandscapeComparisonTable.svelte';

const sampleRows: ComparisonRow[] = [
	{
		label: 'Security review friendly',
		svelteLanggraph: 'yes',
		langflow: 'partial',
		chainlit: 'partial',
		openWebui: 'partial',
		customReact: 'yes'
	}
];

describe('LandscapeComparisonTable', () => {
	test('renders a table with row and column headers', () => {
		render(LandscapeComparisonTable, { rows: sampleRows });

		expect(screen.getByRole('table')).toBeInTheDocument();
		expect(screen.getByRole('rowheader', { name: 'Security review friendly' })).toBeInTheDocument();
		expect(screen.getByRole('columnheader', { name: /svelte-langgraph/i })).toBeInTheDocument();
		expect(screen.getByRole('region', { name: 'Tool comparison' })).toBeInTheDocument();
	});

	describe('cell status rendering', () => {
		// One row covering all three statuses, so each icon/colour branch is exercised.
		const allStatusRows: ComparisonRow[] = [
			{
				label: 'Mixed support',
				svelteLanggraph: 'yes',
				langflow: 'partial',
				chainlit: 'no',
				openWebui: 'no',
				customReact: 'partial'
			}
		];

		test('labels a supported cell', () => {
			render(LandscapeComparisonTable, { rows: allStatusRows });

			expect(
				screen.getByRole('img', { name: 'Supported for svelte-langgraph' })
			).toBeInTheDocument();
		});

		test('labels a partially supported cell', () => {
			render(LandscapeComparisonTable, { rows: allStatusRows });

			expect(
				screen.getByRole('img', { name: 'Partially supported for Langflow' })
			).toBeInTheDocument();
		});

		test('labels an unsupported cell', () => {
			render(LandscapeComparisonTable, { rows: allStatusRows });

			expect(screen.getByRole('img', { name: 'Not supported for Chainlit' })).toBeInTheDocument();
			expect(screen.getByRole('img', { name: 'Not supported for Open WebUI' })).toBeInTheDocument();
		});

		test('colours each status differently', () => {
			render(LandscapeComparisonTable, { rows: allStatusRows });

			const iconFor = (name: string) => screen.getByRole('img', { name }).querySelector('svg');

			expect(iconFor('Supported for svelte-langgraph')).toHaveClass('text-green-500');
			expect(iconFor('Partially supported for Langflow')).toHaveClass('text-yellow-500');
			expect(iconFor('Not supported for Chainlit')).toHaveClass('text-muted-foreground/30');
		});
	});

	test('links out to each comparison tool but not to itself', () => {
		render(LandscapeComparisonTable, { rows: sampleRows });

		expect(screen.getByRole('link', { name: /Langflow/ })).toHaveAttribute(
			'href',
			'https://www.langflow.org'
		);
		expect(screen.queryByRole('link', { name: /svelte-langgraph/ })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /Custom React/ })).not.toBeInTheDocument();
	});

	test('renders one body row per supplied row', () => {
		const rows: ComparisonRow[] = [
			...sampleRows,
			{
				label: 'Second row',
				svelteLanggraph: 'yes',
				langflow: 'no',
				chainlit: 'no',
				openWebui: 'no',
				customReact: 'no'
			}
		];

		render(LandscapeComparisonTable, { rows });

		expect(screen.getByRole('rowheader', { name: 'Security review friendly' })).toBeInTheDocument();
		expect(screen.getByRole('rowheader', { name: 'Second row' })).toBeInTheDocument();
	});
});
