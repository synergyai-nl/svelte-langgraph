/**
 * createStateSync — runes-based reactive factory for LangGraph state field bindings.
 *
 * ## Write path
 * `field.set(v)` calls `stream.submit({ [name]: v }, { optimisticValues: ... })`.
 * This triggers a *state-only* run through the graph: the backend's entry router
 * applies the field update and exits without an LLM call.  useStream then
 * refetches server truth after the run completes.  Optimistic values give an
 * immediate UI update while the round-trip is in flight.
 *
 * Submitting while `stream.isLoading` is true enqueues the submission via
 * useStream's built-in queue — acceptable for lightweight state-only writes.
 *
 * ## threads.updateState as an expert escape hatch
 * `client.threads.updateState` can write directly to the thread checkpoint,
 * bypassing the graph.  It is intentionally NOT used here because:
 *  - No server-side validation (the graph's entry node may reject invalid state)
 *  - Raises HTTP 409 if called while a run is active
 *  - Invisible to useStream — the live stream ignores the write until reconnect
 *  - Forks checkpoint history on the next submit (unexpected branch)
 *
 * ## Degraded mode
 * If `client.assistants.getSchemas` fails or returns a null `state_schema`,
 * `schema.status` becomes `'unavailable'`.  Components should render nothing
 * in that state — the chat remains fully functional without schema widgets.
 */

import type { Client } from '@langchain/langgraph-sdk';
import { parseObjectSchema, type FieldSchema } from './schema.js';

/**
 * Minimal interface stateSync requires from the useStream return value.
 *
 * Typed to accept both the real `WithClassMessages<ResolveStreamInterface<...>>`
 * from `@langchain/svelte` and lightweight test doubles.
 */
export interface StreamLike {
	/** Current thread-state values. May be absent on a fresh (empty) thread. */
	readonly values?: Record<string, unknown>;
	submit(
		input: Record<string, unknown> | null | undefined,
		options?: {
			optimisticValues?: (
				prev: Record<string, unknown>
			) => Record<string, unknown> | Partial<Record<string, unknown>>;
		}
	): void;
}

/** Current state of the remote schema fetch. */
export type SchemaStatus =
	| { status: 'loading' }
	| { status: 'ok'; fields: Record<string, FieldSchema> }
	| { status: 'unavailable' };

/**
 * Reactive binding for a single state field.
 * All property accesses are reactive (getter-based) — reading them inside a
 * Svelte `$derived` or template will re-run when the underlying state changes.
 */
export interface FieldBinding {
	/** Current value from `stream.values` — `undefined` on a fresh thread. */
	readonly value: unknown;
	/** Parsed field schema once loaded; `undefined` while loading or unavailable. */
	readonly schema: FieldSchema | undefined;
	/** Enum option strings, or `[]` for non-enum fields and while loading. */
	readonly options: string[];
	/**
	 * Write a new value via a graph-mediated state submit.
	 * Applies `optimisticValues` immediately; server truth is reconciled
	 * after the run completes.
	 */
	set(v: unknown): void;
}

export interface StateSyncOptions {
	stream: StreamLike;
	client: Client;
	assistantId: string;
}

/**
 * Create a reactive state-sync controller for a LangGraph thread.
 *
 * Fetches the assistant's state schema once on creation and exposes
 * per-field reactive bindings backed by `stream.values`.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   const sync = createStateSync({ stream, client, assistantId });
 * </script>
 * <StateField name="phase" field={sync.field('phase')} />
 * ```
 */
export function createStateSync({ stream, client, assistantId }: StateSyncOptions) {
	let schemaStatus = $state<SchemaStatus>({ status: 'loading' });

	// Fetch schema once; all error paths collapse to 'unavailable'
	(async () => {
		const graphSchema = await client.assistants.getSchemas(assistantId);
		const result = parseObjectSchema(graphSchema.state_schema);
		schemaStatus =
			result.status === 'ok' ? { status: 'ok', fields: result.fields } : { status: 'unavailable' };
	})().catch(() => {
		schemaStatus = { status: 'unavailable' };
	});

	/**
	 * Return a reactive binding for a single field by name.
	 *
	 * In DEV mode, logs a console warning (without blocking) when:
	 *  - The field name is absent from the loaded schema
	 *  - `set()` is called with an enum value that isn't in the field's options
	 */
	function field(name: string): FieldBinding {
		if (import.meta.env.DEV && schemaStatus.status === 'ok' && !(name in schemaStatus.fields)) {
			console.warn(
				`[stateSync] field() called for "${name}" which is absent from the loaded schema`
			);
		}

		return {
			get value(): unknown {
				return stream.values?.[name];
			},
			get schema(): FieldSchema | undefined {
				if (schemaStatus.status !== 'ok') return undefined;
				return schemaStatus.fields[name];
			},
			get options(): string[] {
				if (schemaStatus.status !== 'ok') return [];
				const fs = schemaStatus.fields[name];
				return fs?.kind === 'enum' ? fs.options : [];
			},
			set(v: unknown): void {
				if (import.meta.env.DEV) {
					if (schemaStatus.status === 'ok' && !(name in schemaStatus.fields)) {
						console.warn(
							`[stateSync] set() called for "${name}" which is absent from the loaded schema`
						);
					}
					const fs = schemaStatus.status === 'ok' ? schemaStatus.fields[name] : undefined;
					if (fs?.kind === 'enum' && !fs.options.includes(v as string)) {
						console.warn(
							`[stateSync] set() enum value "${String(v)}" not in options ` +
								`[${fs.options.join(', ')}] for field "${name}"`
						);
					}
				}
				stream.submit(
					{ [name]: v },
					{
						optimisticValues: (prev: Record<string, unknown>) => ({
							...prev,
							[name]: v
						})
					}
				);
			}
		};
	}

	return {
		/** Current schema fetch status — reactive, safe to read in Svelte templates. */
		get schema(): SchemaStatus {
			return schemaStatus;
		},
		field
	};
}
