import { describe, it, expect } from 'vitest';
import { YieldMessages, convertThreadMessage, convertThreadMessages } from './utils';
import { InvalidData } from './errors';
import {
	threadHistoryMessages,
	threadHistoryUnexpectedType
} from '../../../tests/fixtures/streaming-transcripts';
import type { Message as LangGraphMessage } from '@langchain/langgraph-sdk';

// Test helpers
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function expectValidUUID(id: string) {
	expect(id).toBeDefined();
	expect(typeof id).toBe('string');
	expect(id).toMatch(UUID_REGEX);
}

function expectToThrowInvalidData(fn: () => void, errorMessage: string) {
	expect(fn).toThrow(InvalidData);
	expect(fn).toThrow(errorMessage);
}

describe('YieldMessages', () => {
	describe('AIMessageChunk processing', () => {
		it('yields AI message with text content', () => {
			const message = {
				type: 'AIMessageChunk',
				id: 'ai-001',
				content: 'Hello world',
				tool_calls: []
			} as unknown as LangGraphMessage;

			const results = [...YieldMessages(message)];

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				type: 'ai',
				id: 'ai-001',
				text: 'Hello world'
			});
		});

		it('yields AI message and tool calls from same message', () => {
			const message = {
				type: 'AIMessageChunk',
				id: 'ai-002',
				content: 'Let me help you.',
				tool_calls: [
					{
						id: 'tool-001',
						name: 'search',
						args: { query: 'weather' }
					}
				]
			} as unknown as LangGraphMessage;

			const results = [...YieldMessages(message)];

			expect(results).toHaveLength(2);
			expect(results[0]).toEqual({
				type: 'ai',
				id: 'ai-002',
				text: 'Let me help you.'
			});
			expect(results[1]).toEqual({
				type: 'tool',
				id: 'tool-001',
				tool_name: 'search',
				payload: { query: 'weather' },
				text: ''
			});
		});

		it('yields multiple tool calls in order', () => {
			const message = {
				type: 'AIMessageChunk',
				id: 'ai-003',
				content: '',
				tool_calls: [
					{ id: 'tool-a', name: 'first_tool', args: { a: 1 } },
					{ id: 'tool-b', name: 'second_tool', args: { b: 2 } },
					{ id: 'tool-c', name: 'third_tool', args: { c: 3 } }
				]
			} as unknown as LangGraphMessage;

			const results = [...YieldMessages(message)];

			expect(results).toHaveLength(4);
			expect(results[0].type).toBe('ai');
			expect(results[1].id).toBe('tool-a');
			expect(results[2].id).toBe('tool-b');
			expect(results[3].id).toBe('tool-c');
		});

		it('skips tool calls with empty name', () => {
			const message = {
				type: 'AIMessageChunk',
				id: 'ai-004',
				content: 'Processing',
				tool_calls: [
					{ id: 'tool-empty', name: '', args: {} },
					{ id: 'tool-valid', name: 'valid_tool', args: {} }
				]
			} as unknown as LangGraphMessage;

			const results = [...YieldMessages(message)];

			expect(results).toHaveLength(2);
			expect(results[0].type).toBe('ai');
			expect(results[1].id).toBe('tool-valid');
		});

		it('throws InvalidData for missing message id', () => {
			const message = {
				type: 'AIMessageChunk',
				content: 'Hello',
				tool_calls: []
			} as unknown as LangGraphMessage;

			expectToThrowInvalidData(() => [...YieldMessages(message)], 'Message id not defined.');
		});

		it('throws InvalidData for non-string content', () => {
			const message = {
				type: 'AIMessageChunk',
				id: 'ai-005',
				content: { nested: 'object' },
				tool_calls: []
			} as unknown as LangGraphMessage;

			expectToThrowInvalidData(
				() => [...YieldMessages(message)],
				'Message content is not a string.'
			);
		});

		it('throws InvalidData for undefined tool_calls', () => {
			const message = {
				type: 'AIMessageChunk',
				id: 'ai-006',
				content: 'Hello'
			} as unknown as LangGraphMessage;

			expectToThrowInvalidData(() => [...YieldMessages(message)], 'tool_calls cannot be undefined');
		});

		it('throws InvalidData for tool call without id', () => {
			const message = {
				type: 'AIMessageChunk',
				id: 'ai-007',
				content: 'Hello',
				tool_calls: [{ name: 'some_tool', args: {} }]
			} as unknown as LangGraphMessage;

			expectToThrowInvalidData(() => [...YieldMessages(message)], 'No id in tool_call.');
		});
	});

	describe('tool message processing', () => {
		it('yields tool result message with success status', () => {
			const message = {
				type: 'tool',
				id: 'tool-result-001',
				tool_call_id: 'tool-call-001',
				name: 'get_weather',
				content: '{"temp": 22}',
				status: 'success'
			} as unknown as LangGraphMessage;

			const results = [...YieldMessages(message)];

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				type: 'tool',
				id: 'tool-call-001',
				tool_name: 'get_weather',
				text: '{"temp": 22}',
				status: 'success'
			});
		});

		it('yields tool result message with error status', () => {
			const message = {
				type: 'tool',
				id: 'tool-result-002',
				tool_call_id: 'tool-call-002',
				name: 'get_weather',
				content: 'Error: Not found',
				status: 'error'
			} as unknown as LangGraphMessage;

			const results = [...YieldMessages(message)];

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				type: 'tool',
				id: 'tool-call-002',
				tool_name: 'get_weather',
				text: 'Error: Not found',
				status: 'error'
			});
		});

		it('throws InvalidData for tool message with non-string content', () => {
			const message = {
				type: 'tool',
				id: 'tool-result-003',
				tool_call_id: 'tool-call-003',
				name: 'get_weather',
				content: { data: 'object' },
				status: 'success'
			} as unknown as LangGraphMessage;

			expectToThrowInvalidData(
				() => [...YieldMessages(message)],
				'Message content is not a string.'
			);
		});

		it('throws InvalidData for tool message with missing name', () => {
			const message = {
				type: 'tool',
				id: 'tool-result-004',
				tool_call_id: 'tool-call-004',
				content: '{"data": "value"}',
				status: 'success'
			} as unknown as LangGraphMessage;

			expectToThrowInvalidData(() => [...YieldMessages(message)], 'Tool name is not set.');
		});

		it('throws InvalidData for tool message with missing status', () => {
			const message = {
				type: 'tool',
				id: 'tool-result-005',
				tool_call_id: 'tool-call-005',
				name: 'get_weather',
				content: '{"data": "value"}'
			} as unknown as LangGraphMessage;

			expectToThrowInvalidData(() => [...YieldMessages(message)], 'Tool status not present.');
		});
	});

	describe('unexpected message types', () => {
		it('throws InvalidData for unknown message type', () => {
			const message = {
				type: 'unknown',
				id: 'msg-001',
				content: 'Hello'
			} as unknown as LangGraphMessage;

			expect(() => [...YieldMessages(message)]).toThrow(InvalidData);
		});

		it('throws InvalidData for human message type (should not appear in stream)', () => {
			const message = {
				type: 'human',
				id: 'human-001',
				content: 'Hello'
			} as unknown as LangGraphMessage;

			expect(() => [...YieldMessages(message)]).toThrow(InvalidData);
		});
	});
});

describe('convertThreadMessage', () => {
	it('converts human message to UserMessage', () => {
		const input = {
			type: 'human',
			id: 'human-001',
			content: 'What is the weather?'
		};

		const result = convertThreadMessage(input);

		expect(result).toEqual({
			type: 'user',
			id: 'human-001',
			text: 'What is the weather?'
		});
	});

	it('converts ai message to AIMessage', () => {
		const input = {
			type: 'ai',
			id: 'ai-001',
			content: 'The weather is sunny.'
		};

		const result = convertThreadMessage(input);

		expect(result).toEqual({
			type: 'ai',
			id: 'ai-001',
			text: 'The weather is sunny.'
		});
	});

	it('converts tool message to ToolMessage with success status', () => {
		const input = {
			type: 'tool',
			id: 'tool-001',
			tool_call_id: 'call-001',
			name: 'get_weather',
			content: '{"temp": 20}',
			status: 'success'
		};

		const result = convertThreadMessage(input);

		expect(result).toEqual({
			type: 'tool',
			id: 'call-001',
			tool_name: 'get_weather',
			text: '{"temp": 20}',
			status: 'success'
		});
	});

	it('converts tool message to ToolMessage with error status', () => {
		const input = {
			type: 'tool',
			id: 'tool-002',
			tool_call_id: 'call-002',
			name: 'get_weather',
			content: 'Error occurred',
			status: 'error'
		};

		const result = convertThreadMessage(input);

		expect(result).toEqual({
			type: 'tool',
			id: 'call-002',
			tool_name: 'get_weather',
			text: 'Error occurred',
			status: 'error'
		});
	});

	it('defaults to success status when status is missing', () => {
		const input = {
			type: 'tool',
			id: 'tool-003',
			tool_call_id: 'call-003',
			name: 'get_weather',
			content: '{"temp": 25}'
		};

		const result = convertThreadMessage(input);

		expect(result.type).toBe('tool');
		expect((result as { status: string }).status).toBe('success');
	});

	it('handles non-string content by converting to empty string', () => {
		const input = {
			type: 'human',
			id: 'human-002',
			content: { nested: 'object' }
		};

		const result = convertThreadMessage(input);

		expect(result.text).toBe('');
	});

	it('generates UUID when id is missing', () => {
		const input = {
			type: 'human',
			content: 'Hello'
		};

		const result = convertThreadMessage(input);

		expectValidUUID(result.id);
	});

	it('throws InvalidData for unexpected message type', () => {
		const input = {
			type: 'system',
			id: 'system-001',
			content: 'You are a helpful assistant.'
		};

		expectToThrowInvalidData(() => convertThreadMessage(input), 'Unexpected message type: system');
	});

	it('uses tool_call_id as id for tool messages when available', () => {
		const input = {
			type: 'tool',
			id: 'tool-id',
			tool_call_id: 'call-id',
			name: 'some_tool',
			content: 'result',
			status: 'success'
		};

		const result = convertThreadMessage(input);

		expect(result.id).toBe('call-id');
	});

	it('falls back to id when tool_call_id is missing', () => {
		const input = {
			type: 'tool',
			id: 'tool-id',
			name: 'some_tool',
			content: 'result',
			status: 'success'
		};

		const result = convertThreadMessage(input);

		expect(result.id).toBe('tool-id');
	});

	it('handles non-string content for ai message by converting to empty string', () => {
		const input = {
			type: 'ai',
			id: 'ai-002',
			content: { nested: 'object' }
		};

		const result = convertThreadMessage(input);

		expect(result.text).toBe('');
	});

	it('generates UUID for ai message when id is missing', () => {
		const input = {
			type: 'ai',
			content: 'Hello there'
		};

		const result = convertThreadMessage(input);

		expectValidUUID(result.id);
	});

	it('handles non-string content for tool message by converting to empty string', () => {
		const input = {
			type: 'tool',
			id: 'tool-004',
			tool_call_id: 'call-004',
			name: 'some_tool',
			content: { nested: 'data' },
			status: 'success'
		};

		const result = convertThreadMessage(input);

		expect(result.text).toBe('');
	});

	it('handles missing name for tool message by using empty string', () => {
		const input = {
			type: 'tool',
			id: 'tool-005',
			tool_call_id: 'call-005',
			content: 'result',
			status: 'success'
		};

		const result = convertThreadMessage(input);

		expect((result as { tool_name: string }).tool_name).toBe('');
	});

	it('generates UUID for tool message when both tool_call_id and id are missing', () => {
		const input = {
			type: 'tool',
			name: 'some_tool',
			content: 'result',
			status: 'success'
		};

		const result = convertThreadMessage(input);

		expectValidUUID(result.id);
	});
});

describe('convertThreadMessages', () => {
	it('converts array of thread messages', () => {
		const results = convertThreadMessages(threadHistoryMessages);

		expect(results).toHaveLength(3);
		expect(results[0].type).toBe('user');
		expect(results[1].type).toBe('ai');
		expect(results[2].type).toBe('tool');
	});

	it('preserves message ordering', () => {
		const results = convertThreadMessages(threadHistoryMessages);

		expect(results[0].text).toBe('What is the weather like?');
		expect(results[1].text).toBe('The weather is sunny today.');
		expect(results[2].text).toBe('{"temperature": 20}');
	});

	it('returns empty array for empty input', () => {
		const results = convertThreadMessages([]);

		expect(results).toEqual([]);
	});

	it('throws InvalidData for messages with unexpected type', () => {
		expect(() => convertThreadMessages(threadHistoryUnexpectedType)).toThrow(InvalidData);
	});

	it('converts mixed message types correctly', () => {
		const input = [
			{ type: 'human', id: 'h1', content: 'Question 1' },
			{ type: 'ai', id: 'a1', content: 'Answer 1' },
			{ type: 'human', id: 'h2', content: 'Question 2' },
			{
				type: 'tool',
				id: 't1',
				tool_call_id: 'tc1',
				name: 'search',
				content: 'results',
				status: 'success'
			},
			{ type: 'ai', id: 'a2', content: 'Answer 2' }
		];

		const results = convertThreadMessages(input);

		expect(results).toHaveLength(5);
		expect(results.map((r) => r.type)).toEqual(['user', 'ai', 'user', 'tool', 'ai']);
	});
});
