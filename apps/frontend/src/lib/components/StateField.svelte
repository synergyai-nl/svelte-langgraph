<script lang="ts">
	import type { FieldBinding } from '$lib/langgraph/stateSync.svelte.js';
	import type { Snippet } from 'svelte';

	interface Props {
		/** State field name — used as the fallback accessible label and test id. */
		name: string;
		/** Reactive field binding from `createStateSync().field(name)`. */
		field: FieldBinding;
		/** Human-readable label; falls back to `name` when omitted. */
		label?: string;
		/**
		 * Custom renderer snippet (escape hatch).
		 * When provided, replaces built-in rendering entirely.
		 * Receives the field binding so custom renderers can still call `field.set()`.
		 */
		children?: Snippet<[FieldBinding]>;
	}

	let { name, field, label, children }: Props = $props();

	const accessibleName = $derived(label ?? name);
	const inputId = $derived(`state-field-input-${name}`);

	function handleCheckboxChange(e: Event) {
		field.set((e.currentTarget as HTMLInputElement).checked);
	}

	// Text/number commit on change (blur/Enter), not per keystroke: every set()
	// is a full graph run, and submits during a run enqueue server-side runs.
	function handleTextChange(e: Event) {
		field.set((e.currentTarget as HTMLInputElement).value);
	}

	function handleNumberChange(e: Event) {
		const value = (e.currentTarget as HTMLInputElement).valueAsNumber;
		if (!Number.isNaN(value)) field.set(value);
	}
</script>

<!--
  Renders nothing while schema is loading or unavailable (degraded mode).
  The chat remains fully functional without this widget.
-->
{#if field.schema !== undefined}
	<div data-testid="state-field-{name}" class="flex items-center gap-2">
		{#if children}
			{@render children(field)}
		{:else if field.schema.kind === 'enum'}
			<label class="text-muted-foreground text-xs" for={inputId}>{accessibleName}</label>
			<!-- Function binding drives the select's value property directly. Per-option
			     `selected` attributes would break here: once the user has picked an option,
			     the browser ignores attribute changes on it (dirty flag), so later
			     programmatic state changes could desync the visible selection. -->
			<select
				id={inputId}
				aria-label={accessibleName}
				bind:value={() => (field.value as string) ?? '', (v) => field.set(v)}
				class="border-border bg-card text-foreground focus:ring-ring rounded border px-2 py-0.5 text-xs focus:ring-1 focus:outline-none"
			>
				{#if field.value === undefined}
					<option value="" disabled>—</option>
				{/if}
				{#each field.options as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
		{:else if field.schema.kind === 'boolean'}
			<label class="text-muted-foreground flex items-center gap-1.5 text-xs" for={inputId}>
				{accessibleName}
				<input
					type="checkbox"
					id={inputId}
					aria-label={accessibleName}
					checked={!!field.value}
					onchange={handleCheckboxChange}
					class="rounded"
				/>
			</label>
		{:else if field.schema.kind === 'string'}
			<label class="text-muted-foreground text-xs" for={inputId}>{accessibleName}</label>
			<input
				type="text"
				id={inputId}
				aria-label={accessibleName}
				value={String(field.value ?? '')}
				onchange={handleTextChange}
				class="border-border bg-card text-foreground focus:ring-ring rounded border px-2 py-0.5 text-xs focus:ring-1 focus:outline-none"
			/>
		{:else if field.schema.kind === 'number'}
			<label class="text-muted-foreground text-xs" for={inputId}>{accessibleName}</label>
			<input
				type="number"
				id={inputId}
				aria-label={accessibleName}
				value={field.value as number | undefined}
				onchange={handleNumberChange}
				class="border-border bg-card text-foreground focus:ring-ring rounded border px-2 py-0.5 text-xs focus:ring-1 focus:outline-none"
			/>
		{/if}
	</div>
{/if}
