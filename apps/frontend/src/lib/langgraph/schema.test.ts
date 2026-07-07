import { describe, it, expect } from 'vitest';
import { parseObjectSchema } from './schema.js';

describe('parseObjectSchema', () => {
	describe('null / undefined input', () => {
		it('returns unavailable for null', () => {
			expect(parseObjectSchema(null)).toEqual({ status: 'unavailable' });
		});

		it('returns unavailable for undefined', () => {
			expect(parseObjectSchema(undefined)).toEqual({ status: 'unavailable' });
		});
	});

	describe('direct enum field', () => {
		it('parses a string enum field directly on properties', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: {
					phase: { type: 'string', enum: ['research', 'draft', 'review'] }
				}
			});
			expect(result).toEqual({
				status: 'ok',
				fields: {
					phase: { kind: 'enum', options: ['research', 'draft', 'review'] }
				}
			});
		});

		it('parses a bare enum (no type key)', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: {
					status: { enum: ['open', 'closed'] }
				}
			});
			expect(result).toEqual({
				status: 'ok',
				fields: {
					status: { kind: 'enum', options: ['open', 'closed'] }
				}
			});
		});
	});

	describe('$defs + $ref indirection (dynamic enum shape)', () => {
		it('resolves a $ref to a $defs enum', () => {
			const result = parseObjectSchema({
				$defs: {
					Phases: { enum: ['research', 'draft', 'review'], type: 'string' }
				},
				properties: {
					phase: { $ref: '#/$defs/Phases' }
				},
				type: 'object'
			});
			expect(result).toEqual({
				status: 'ok',
				fields: {
					phase: { kind: 'enum', options: ['research', 'draft', 'review'] }
				}
			});
		});

		it('resolves a $ref to a definitions enum', () => {
			const result = parseObjectSchema({
				definitions: {
					Mode: { enum: ['fast', 'slow'], type: 'string' }
				},
				properties: {
					mode: { $ref: '#/definitions/Mode' }
				},
				type: 'object'
			});
			expect(result).toEqual({
				status: 'ok',
				fields: {
					mode: { kind: 'enum', options: ['fast', 'slow'] }
				}
			});
		});

		it('returns unknown for an unresolvable $ref', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: {
					x: { $ref: '#/$defs/DoesNotExist' }
				}
			});
			expect(result).toEqual({
				status: 'ok',
				fields: { x: { kind: 'unknown' } }
			});
		});
	});

	describe('anyOf / nullable wrappers', () => {
		it('unwraps anyOf [enum, null] to enum', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: {
					phase: {
						anyOf: [{ type: 'string', enum: ['a', 'b'] }, { type: 'null' }]
					}
				}
			});
			expect(result).toEqual({
				status: 'ok',
				fields: { phase: { kind: 'enum', options: ['a', 'b'] } }
			});
		});

		it('unwraps anyOf [string, null] to string', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: {
					name: {
						anyOf: [{ type: 'string' }, { type: 'null' }]
					}
				}
			});
			expect(result).toEqual({
				status: 'ok',
				fields: { name: { kind: 'string' } }
			});
		});

		it('unwraps oneOf with a single non-null variant', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: {
					flag: {
						oneOf: [{ type: 'boolean' }, { type: 'null' }]
					}
				}
			});
			expect(result).toEqual({
				status: 'ok',
				fields: { flag: { kind: 'boolean' } }
			});
		});
	});

	describe('scalar types', () => {
		it('parses boolean', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: { enabled: { type: 'boolean' } }
			});
			expect(result).toEqual({
				status: 'ok',
				fields: { enabled: { kind: 'boolean' } }
			});
		});

		it('parses string', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: { name: { type: 'string' } }
			});
			expect(result).toEqual({
				status: 'ok',
				fields: { name: { kind: 'string' } }
			});
		});

		it('parses number', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: { score: { type: 'number' } }
			});
			expect(result).toEqual({
				status: 'ok',
				fields: { score: { kind: 'number' } }
			});
		});

		it('maps integer to number', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: { count: { type: 'integer' } }
			});
			expect(result).toEqual({
				status: 'ok',
				fields: { count: { kind: 'number' } }
			});
		});
	});

	describe('unknown fallback', () => {
		it('maps an unrecognised type to unknown', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: { data: { type: 'array' } }
			});
			expect(result).toEqual({
				status: 'ok',
				fields: { data: { kind: 'unknown' } }
			});
		});

		it('maps a schema with no type or enum to unknown', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: { x: {} }
			});
			expect(result).toEqual({
				status: 'ok',
				fields: { x: { kind: 'unknown' } }
			});
		});

		it('returns ok with empty fields for a schema with no properties', () => {
			// An object schema with no properties is still parseable
			const result = parseObjectSchema({ type: 'object' });
			expect(result).toEqual({ status: 'ok', fields: {} });
		});
	});

	describe('nested object', () => {
		it('recursively parses nested object properties', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: {
					config: {
						type: 'object',
						properties: {
							mode: { type: 'string', enum: ['fast', 'slow'] },
							retries: { type: 'integer' }
						}
					}
				}
			});
			expect(result).toEqual({
				status: 'ok',
				fields: {
					config: {
						kind: 'object',
						properties: {
							mode: { kind: 'enum', options: ['fast', 'slow'] },
							retries: { kind: 'number' }
						}
					}
				}
			});
		});
	});

	describe('multiple fields', () => {
		it('parses multiple top-level fields', () => {
			const result = parseObjectSchema({
				type: 'object',
				properties: {
					phase: { type: 'string', enum: ['a', 'b'] },
					enabled: { type: 'boolean' },
					label: { type: 'string' }
				}
			});
			expect(result.status).toBe('ok');
			if (result.status === 'ok') {
				expect(result.fields.phase).toEqual({ kind: 'enum', options: ['a', 'b'] });
				expect(result.fields.enabled).toEqual({ kind: 'boolean' });
				expect(result.fields.label).toEqual({ kind: 'string' });
			}
		});
	});
});
