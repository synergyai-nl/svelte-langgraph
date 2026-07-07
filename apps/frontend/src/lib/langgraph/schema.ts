/**
 * Generic JSON-Schema parser for LangGraph state schemas.
 *
 * Pure TypeScript — no Svelte or DOM dependencies — safe to reuse for
 * tool-arg schemas, interrupt schemas, and any other JSON Schema payloads.
 */

/**
 * Minimal structural JSONSchema7 type.
 *
 * `@types/json-schema` is only a transitive dependency of
 * `@langchain/langgraph-sdk`, not a direct dependency of this package.
 * Defining the subset we actually need keeps the import graph clean and
 * avoids having to add a direct dev-dependency.
 */
export interface JSONSchema7 {
	type?: string | string[];
	enum?: unknown[];
	properties?: Record<string, JSONSchema7>;
	anyOf?: JSONSchema7[];
	oneOf?: JSONSchema7[];
	$ref?: string;
	$defs?: Record<string, JSONSchema7>;
	definitions?: Record<string, JSONSchema7>;
	items?: JSONSchema7 | JSONSchema7[];
	/** Allow arbitrary additional JSON Schema keywords without error. */
	[key: string]: unknown;
}

export type FieldSchema =
	| { kind: 'enum'; options: string[] }
	| { kind: 'boolean' }
	| { kind: 'string' }
	| { kind: 'number' }
	| { kind: 'object'; properties: Record<string, FieldSchema> }
	| { kind: 'unknown' };

export type ParseObjectSchemaResult =
	| { status: 'ok'; fields: Record<string, FieldSchema> }
	| { status: 'unavailable' };

/** Resolve a local JSON Pointer `$ref` against the combined `$defs`/`definitions` map. */
function resolveRef(ref: string, defs: Record<string, JSONSchema7>): JSONSchema7 | undefined {
	// Handles both #/$defs/Name and #/definitions/Name
	const match = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(ref);
	if (!match) return undefined;
	return defs[match[1]];
}

/**
 * Recursively parse a single field schema node.
 *
 * Rules applied in order:
 *  1. Resolve `$ref` via the supplied `defs` map.
 *  2. Unwrap `anyOf`/`oneOf` — strip `null`-typed variants and recurse into
 *     the remaining variant(s).  A single non-null variant is treated as the
 *     field type; multiple non-null variants → first one that isn't 'unknown'.
 *  3. Non-empty string `enum` → `kind: 'enum'`.
 *  4. Scalar types: `boolean`, `string`, `number`, `integer` → corresponding kind.
 *  5. `object` with `properties` → `kind: 'object'` with recursively parsed fields.
 *  6. Anything unrecognised → `kind: 'unknown'` (never throws).
 */
function parseFieldSchema(
	schema: JSONSchema7,
	defs: Record<string, JSONSchema7>,
	depth = 0
): FieldSchema {
	// Guard against malformed cyclic schemas
	if (depth > 10) return { kind: 'unknown' };

	// 1. Resolve $ref
	if (schema.$ref) {
		const resolved = resolveRef(schema.$ref, defs);
		if (resolved) return parseFieldSchema(resolved, defs, depth + 1);
		return { kind: 'unknown' };
	}

	// 2. Unwrap anyOf / oneOf (handle nullable: anyOf [T, null])
	const ofVariants = schema.anyOf ?? schema.oneOf;
	if (ofVariants) {
		const nonNull = ofVariants.filter(
			(v) =>
				!(v.type === 'null' || (Array.isArray(v.type) && (v.type as string[]).includes('null')))
		);
		if (nonNull.length === 1) {
			return parseFieldSchema(nonNull[0], defs, depth + 1);
		}
		if (nonNull.length > 1) {
			// Return first variant that resolves to something meaningful
			for (const v of nonNull) {
				const s = parseFieldSchema(v, defs, depth + 1);
				if (s.kind !== 'unknown') return s;
			}
		}
		return { kind: 'unknown' };
	}

	// 3. Enum (string enum values only; bare enums without type are valid)
	if (Array.isArray(schema.enum)) {
		const options = (schema.enum as unknown[]).filter((v): v is string => typeof v === 'string');
		if (options.length > 0) return { kind: 'enum', options };
	}

	const type = schema.type;

	// 4. Scalar types
	if (type === 'boolean') return { kind: 'boolean' };
	if (type === 'string') return { kind: 'string' };
	if (type === 'number' || type === 'integer') return { kind: 'number' };

	// 5. Object
	if (type === 'object' && schema.properties) {
		const properties: Record<string, FieldSchema> = {};
		for (const [key, val] of Object.entries(schema.properties)) {
			properties[key] = parseFieldSchema(val, defs, depth + 1);
		}
		return { kind: 'object', properties };
	}

	// 6. Fallback
	return { kind: 'unknown' };
}

/**
 * Parse the top-level JSON Schema describing a LangGraph graph state object.
 *
 * Accepts `unknown` so callers can pass the SDK's `GraphSchema.state_schema`
 * directly without needing a cast (the SDK's `JSONSchema7` and our local one
 * have different structural types for `properties` due to the JSON Schema spec
 * allowing boolean sub-schemas, e.g. `{ "additionalProperties": false }`).
 *
 * Returns `{ status: 'unavailable' }` when:
 *  - `schema` is `null`, `undefined`, or not an object
 *  - The schema has no `properties` (not an object schema)
 *  - An unexpected exception is thrown during parsing
 *
 * Never throws — all errors are absorbed and mapped to `'unavailable'`.
 */
export function parseObjectSchema(schema: unknown): ParseObjectSchemaResult {
	if (schema == null || typeof schema !== 'object') return { status: 'unavailable' };

	try {
		// Cast to our working type now that we know it's an object
		const s = schema as JSONSchema7;

		// Build the combined $defs / definitions map for $ref resolution
		const defs: Record<string, JSONSchema7> = {
			...(s.$defs as Record<string, JSONSchema7> | undefined),
			...(s.definitions as Record<string, JSONSchema7> | undefined)
		};

		const rawProperties = s.properties as Record<string, unknown> | undefined;
		const fields: Record<string, FieldSchema> = {};

		if (rawProperties) {
			for (const [key, val] of Object.entries(rawProperties)) {
				// Boolean schemas (e.g. `false` for disallowed props) → unknown
				if (typeof val !== 'object' || val === null) {
					fields[key] = { kind: 'unknown' };
				} else {
					fields[key] = parseFieldSchema(val as JSONSchema7, defs, 0);
				}
			}
		}

		return { status: 'ok', fields };
	} catch {
		return { status: 'unavailable' };
	}
}
