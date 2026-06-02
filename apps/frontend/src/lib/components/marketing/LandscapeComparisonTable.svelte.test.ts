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
});
