<script lang="ts">
	import { Check, X, Minus, ExternalLink } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils';

	export type CellStatus = 'yes' | 'no' | 'partial';

	export interface ComparisonRow {
		label: string;
		svelteLanggraph: CellStatus;
		langflow: CellStatus;
		chainlit: CellStatus;
		openWebui: CellStatus;
		customReact: CellStatus;
	}

	interface ColumnDef {
		key: keyof Omit<ComparisonRow, 'label'>;
		label: string;
		href: string | null;
		highlight?: boolean;
	}

	interface Props {
		rows: ComparisonRow[];
		class?: string;
	}

	let { rows, class: className = '' }: Props = $props();

	const columns: ColumnDef[] = [
		{ key: 'svelteLanggraph', label: 'svelte-langgraph', href: null, highlight: true },
		{ key: 'langflow', label: 'Langflow', href: 'https://www.langflow.org' },
		{ key: 'chainlit', label: 'Chainlit', href: 'https://chainlit.io' },
		{ key: 'openWebui', label: 'Open WebUI', href: 'https://openwebui.com' },
		{ key: 'customReact', label: 'Custom React', href: null }
	];

	function getRowCells(row: ComparisonRow): CellStatus[] {
		return columns.map((col) => row[col.key]);
	}

	function statusIcon(status: CellStatus): Component<{ class?: string }> {
		if (status === 'yes') return Check;
		if (status === 'partial') return Minus;
		return X;
	}

	function statusColor(status: CellStatus): string {
		if (status === 'yes') return 'text-green-500';
		if (status === 'partial') return 'text-yellow-500';
		return 'text-muted-foreground/30';
	}

	function statusAriaLabel(status: CellStatus, toolName: string): string {
		// Tool names are product names and stay untranslated.
		if (status === 'yes') return m.landing_table_status_supported({ tool: toolName });
		if (status === 'partial') return m.landing_table_status_partial({ tool: toolName });
		return m.landing_table_status_unsupported({ tool: toolName });
	}

	/** Compact = container narrower than table; opaque fills required for sticky overlap. */
	const stickyHeaderCell =
		'bg-muted @max-[50rem]:sticky @max-[50rem]:top-0 @max-[50rem]:z-20 @max-[50rem]:shadow-[0_1px_0_0_hsl(var(--border-card))]';
	const stickyCornerCell =
		'bg-muted @max-[50rem]:sticky @max-[50rem]:top-0 @max-[50rem]:left-0 @max-[50rem]:z-30';
	/** z-10 so body rows slide under the header row (z-20) and corner (z-30). */
	const stickyRowHeaderBase =
		'@max-[50rem]:sticky @max-[50rem]:left-0 @max-[50rem]:z-10 @max-[50rem]:shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)] dark:@max-[50rem]:shadow-[4px_0_8px_-2px_rgba(0,0,0,0.35)]';
</script>

<div
	role="region"
	aria-label={m.landing_table_region_label()}
	class={cn('bg-card @container overflow-hidden rounded-xl border', className)}
>
	<div
		data-testid="landscape-table-scroll"
		class="@max-[50rem]:max-h-[min(70vh,32rem)] @max-[50rem]:overflow-auto"
	>
		<table class="w-full min-w-[800px] border-collapse text-sm">
			<caption class="sr-only">
				{m.landing_table_caption()}
			</caption>
			<thead>
				<tr class="bg-muted border-b">
					<th
						scope="col"
						aria-hidden="true"
						class={cn(
							'text-muted-foreground bg-muted w-[min(28%,12rem)] p-4 text-left font-medium',
							stickyCornerCell
						)}
					></th>
					{#each columns as column (column.key)}
						<th scope="col" class={cn('border-l p-4 text-center font-semibold', stickyHeaderCell)}>
							{#if column.href}
								<a
									href={column.href}
									target="_blank"
									rel="noopener noreferrer"
									class="text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1 transition-colors"
								>
									{column.label}
									<ExternalLink class="size-3.5 shrink-0 opacity-60" />
								</a>
							{:else if column.highlight}
								<span class="text-primary-600">{column.label}</span>
							{:else}
								<span class="text-muted-foreground">{column.label}</span>
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i (row.label)}
					{@const striped = i % 2 === 1}
					{@const rowBg = striped
						? 'bg-[color-mix(in_hsl,hsl(var(--muted))_14%,hsl(var(--card)))]'
						: 'bg-card'}
					<tr class={cn('border-b last:border-b-0', rowBg)}>
						<th scope="row" class={cn('p-4 text-left font-normal', rowBg, stickyRowHeaderBase)}>
							{row.label}
						</th>
						{#each getRowCells(row) as status, colIndex (`${row.label}-${colIndex}`)}
							{@const column = columns[colIndex]}
							{@const Icon = statusIcon(status)}
							<td class="border-l p-4 text-center">
								<span
									class="inline-flex items-center justify-center"
									aria-label={statusAriaLabel(status, column.label)}
									role="img"
								>
									<Icon class="size-5 {statusColor(status)}" />
								</span>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
