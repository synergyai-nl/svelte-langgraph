import { describe, it, expect } from 'vitest';
import {
	YieldMessages,
	convertThreadMessage,
	convertThreadMessages,
	extractTextFromContent,
	extractThinkingFromContent
} from './utils';
import { InvalidData } from './errors';

describe('YieldMessages', () => {
	describe('AIMessageChunk parsing', () => {
		it('should parse AIMessageChunk with text content', () => {
			const message = {
				type: 'AIMessageChunk',
				content: 'Hello, world!',
				id: 'msg-123',
				tool_calls: []
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				type: 'ai',
				text: 'Hello, world!',
				id: 'msg-123'
			});
		});

		it('should parse AIMessageChunk with empty content', () => {
			const message = {
				type: 'AIMessageChunk',
				content: '',
				id: 'msg-124',
				tool_calls: []
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				type: 'ai',
				text: '',
				id: 'msg-124'
			});
		});

		it('should throw InvalidData when id is missing', () => {
			const message = {
				type: 'AIMessageChunk',
				content: 'Hello',
				tool_calls: []
			};

			expect(() => [...YieldMessages(message as never)]).toThrow(InvalidData);
			expect(() => [...YieldMessages(message as never)]).toThrow('Message id not defined.');
		});

		it('should handle content array with text blocks', () => {
			const message = {
				type: 'AIMessageChunk',
				content: [{ type: 'text', text: 'Hello' }],
				id: 'msg-125',
				tool_calls: []
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				type: 'ai',
				text: 'Hello',
				id: 'msg-125'
			});
		});

		it('should handle content array with thinking and text blocks', () => {
			const message = {
				type: 'AIMessageChunk',
				content: [
					{ type: 'thinking', thinking: 'Let me think...' },
					{ type: 'text', text: 'The answer is 42' }
				],
				id: 'msg-125b',
				tool_calls: []
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				type: 'ai',
				text: 'The answer is 42',
				thinking: 'Let me think...',
				id: 'msg-125b'
			});
		});

		it('should extract thinking from additional_kwargs.reasoning_content', () => {
			const message = {
				type: 'AIMessageChunk',
				content: 'The answer is 42',
				additional_kwargs: { reasoning_content: 'Let me reason...' },
				id: 'msg-125c',
				tool_calls: []
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				type: 'ai',
				text: 'The answer is 42',
				thinking: 'Let me reason...',
				id: 'msg-125c'
			});
		});

		it('should not include thinking field when no thinking present', () => {
			const message = {
				type: 'AIMessageChunk',
				content: 'Plain response',
				id: 'msg-125d',
				tool_calls: []
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(1);
			expect(results[0]).not.toHaveProperty('thinking');
		});

		it('should throw InvalidData when tool_calls is undefined', () => {
			const message = {
				type: 'AIMessageChunk',
				content: 'Hello',
				id: 'msg-126'
			};

			expect(() => [...YieldMessages(message as never)]).toThrow(InvalidData);
			expect(() => [...YieldMessages(message as never)]).toThrow('tool_calls cannot be undefined');
		});
	});

	describe('Tool call extraction from AIMessageChunk', () => {
		it('should extract tool calls from AIMessageChunk', () => {
			const message = {
				type: 'AIMessageChunk',
				content: '',
				id: 'msg-127',
				tool_calls: [
					{
						name: 'get_weather',
						args: { city: 'Amsterdam' },
						id: 'call-001'
					}
				]
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(2);
			expect(results[0]).toEqual({
				type: 'ai',
				text: '',
				id: 'msg-127'
			});
			expect(results[1]).toEqual({
				type: 'tool',
				tool_name: 'get_weather',
				payload: { city: 'Amsterdam' },
				id: 'call-001',
				text: ''
			});
		});

		it('should extract multiple tool calls', () => {
			const message = {
				type: 'AIMessageChunk',
				content: 'Let me check that for you.',
				id: 'msg-128',
				tool_calls: [
					{
						name: 'get_weather',
						args: { city: 'Amsterdam' },
						id: 'call-001'
					},
					{
						name: 'get_time',
						args: { timezone: 'Europe/Amsterdam' },
						id: 'call-002'
					}
				]
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(3);
			expect(results[0].type).toBe('ai');
			expect(results[1]).toMatchObject({
				type: 'tool',
				tool_name: 'get_weather'
			});
			expect(results[2]).toMatchObject({
				type: 'tool',
				tool_name: 'get_time'
			});
		});

		it('should skip tool calls with empty name', () => {
			const message = {
				type: 'AIMessageChunk',
				content: '',
				id: 'msg-129',
				tool_calls: [
					{
						name: '',
						args: {},
						id: 'call-001'
					},
					{
						name: 'get_weather',
						args: { city: 'Paris' },
						id: 'call-002'
					}
				]
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(2);
			expect(results[0].type).toBe('ai');
			expect(results[1]).toMatchObject({
				type: 'tool',
				tool_name: 'get_weather'
			});
		});

		it('should throw InvalidData when tool_call has no id', () => {
			const message = {
				type: 'AIMessageChunk',
				content: '',
				id: 'msg-130',
				tool_calls: [
					{
						name: 'get_weather',
						args: { city: 'Amsterdam' }
					}
				]
			};

			expect(() => [...YieldMessages(message as never)]).toThrow(InvalidData);
			expect(() => [...YieldMessages(message as never)]).toThrow('No id in tool_call.');
		});
	});

	describe('Tool message parsing', () => {
		it('should parse tool response message', () => {
			const message = {
				type: 'tool',
				content: "It's always sunny in Amsterdam!",
				name: 'get_weather',
				id: 'tool-msg-001',
				tool_call_id: 'call-001',
				status: 'success'
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				type: 'tool',
				tool_name: 'get_weather',
				id: 'call-001',
				text: "It's always sunny in Amsterdam!",
				status: 'success'
			});
		});

		it('should parse tool response with error status', () => {
			const message = {
				type: 'tool',
				content: 'Failed to fetch weather data',
				name: 'get_weather',
				id: 'tool-msg-002',
				tool_call_id: 'call-002',
				status: 'error'
			};

			const results = [...YieldMessages(message as never)];

			expect(results).toHaveLength(1);
			expect(results[0]).toMatchObject({
				type: 'tool',
				status: 'error',
				text: 'Failed to fetch weather data'
			});
		});

		it('should throw InvalidData when tool message has no id', () => {
			const message = {
				type: 'tool',
				content: 'Result',
				name: 'get_weather',
				tool_call_id: 'call-001',
				status: 'success'
			};

			expect(() => [...YieldMessages(message as never)]).toThrow(InvalidData);
			expect(() => [...YieldMessages(message as never)]).toThrow('Message id not defined.');
		});

		it('should throw InvalidData when tool message content is not a string', () => {
			const message = {
				type: 'tool',
				content: { result: 'sunny' },
				name: 'get_weather',
				id: 'tool-msg-003',
				tool_call_id: 'call-001',
				status: 'success'
			};

			expect(() => [...YieldMessages(message as never)]).toThrow(InvalidData);
			expect(() => [...YieldMessages(message as never)]).toThrow(
				'Message content is not a string.'
			);
		});

		it('should throw InvalidData when tool name is not set', () => {
			const message = {
				type: 'tool',
				content: 'Result',
				id: 'tool-msg-004',
				tool_call_id: 'call-001',
				status: 'success'
			};

			expect(() => [...YieldMessages(message as never)]).toThrow(InvalidData);
			expect(() => [...YieldMessages(message as never)]).toThrow('Tool name is not set.');
		});

		it('should throw InvalidData when tool status is not present', () => {
			const message = {
				type: 'tool',
				content: 'Result',
				name: 'get_weather',
				id: 'tool-msg-005',
				tool_call_id: 'call-001'
			};

			expect(() => [...YieldMessages(message as never)]).toThrow(InvalidData);
			expect(() => [...YieldMessages(message as never)]).toThrow('Tool status not present.');
		});
	});

	describe('Unexpected message types', () => {
		it('should throw InvalidData for unexpected message type', () => {
			const message = {
				type: 'unknown',
				content: 'Hello',
				id: 'msg-131'
			};

			expect(() => [...YieldMessages(message as never)]).toThrow(InvalidData);
			expect(() => [...YieldMessages(message as never)]).toThrow('Unexpected message on:');
		});

		it('should throw InvalidData for human message type', () => {
			const message = {
				type: 'human',
				content: 'Hello',
				id: 'msg-132'
			};

			expect(() => [...YieldMessages(message as never)]).toThrow(InvalidData);
		});
	});
});

describe('convertThreadMessage', () => {
	it('should convert human message to UserMessage', () => {
		const item = {
			type: 'human',
			content: 'Hello, AI!',
			id: 'user-msg-001'
		};

		const result = convertThreadMessage(item);

		expect(result).toEqual({
			type: 'user',
			text: 'Hello, AI!',
			id: 'user-msg-001'
		});
	});

	it('should convert ai message to AIMessage', () => {
		const item = {
			type: 'ai',
			content: 'Hello, human!',
			id: 'ai-msg-001'
		};

		const result = convertThreadMessage(item);

		expect(result).toEqual({
			type: 'ai',
			text: 'Hello, human!',
			id: 'ai-msg-001'
		});
	});

	it('should convert tool message to ToolMessage', () => {
		const item = {
			type: 'tool',
			content: 'Weather data',
			name: 'get_weather',
			tool_call_id: 'call-001',
			status: 'success'
		};

		const result = convertThreadMessage(item);

		expect(result).toEqual({
			type: 'tool',
			text: 'Weather data',
			tool_name: 'get_weather',
			id: 'call-001',
			status: 'success'
		});
	});

	it('should generate UUID when id is missing for human message', () => {
		const item = {
			type: 'human',
			content: 'Hello'
		};

		const result = convertThreadMessage(item);

		expect(result.type).toBe('user');
		expect(result.id).toBeDefined();
		expect(result.id.length).toBeGreaterThan(0);
	});

	it('should handle non-string content gracefully', () => {
		const item = {
			type: 'human',
			content: null,
			id: 'msg-001'
		};

		const result = convertThreadMessage(item);

		expect(result.text).toBe('');
	});

	it('should convert ai message with array content to AIMessage', () => {
		const item = {
			type: 'ai',
			content: [
				{ type: 'thinking', thinking: 'Let me think...' },
				{ type: 'text', text: 'Hello, human!' }
			],
			id: 'ai-msg-002'
		};

		const result = convertThreadMessage(item);

		expect(result).toEqual({
			type: 'ai',
			text: 'Hello, human!',
			thinking: 'Let me think...',
			id: 'ai-msg-002'
		});
	});

	it('should convert ai message with additional_kwargs reasoning_content', () => {
		const item = {
			type: 'ai',
			content: 'Hello, human!',
			additional_kwargs: { reasoning_content: 'My reasoning here' },
			id: 'ai-msg-003'
		};

		const result = convertThreadMessage(item);

		expect(result).toEqual({
			type: 'ai',
			text: 'Hello, human!',
			thinking: 'My reasoning here',
			id: 'ai-msg-003'
		});
	});

	it('should throw InvalidData for unexpected message type', () => {
		const item = {
			type: 'unknown',
			content: 'Hello',
			id: 'msg-001'
		};

		expect(() => convertThreadMessage(item)).toThrow(InvalidData);
		expect(() => convertThreadMessage(item)).toThrow('Unexpected message type: unknown');
	});
});

describe('extractTextFromContent', () => {
	it('should return string content as-is', () => {
		expect(extractTextFromContent('Hello')).toBe('Hello');
	});

	it('should return empty string for empty string content', () => {
		expect(extractTextFromContent('')).toBe('');
	});

	it('should extract text from content array', () => {
		const content = [
			{ type: 'text', text: 'Hello ' },
			{ type: 'text', text: 'world' }
		];
		expect(extractTextFromContent(content)).toBe('Hello world');
	});

	it('should skip non-text blocks in content array', () => {
		const content = [
			{ type: 'thinking', thinking: 'Let me think' },
			{ type: 'text', text: 'Answer' }
		];
		expect(extractTextFromContent(content)).toBe('Answer');
	});

	it('should return empty string for empty content array', () => {
		expect(extractTextFromContent([])).toBe('');
	});

	it('should return empty string for null/undefined', () => {
		expect(extractTextFromContent(null)).toBe('');
		expect(extractTextFromContent(undefined)).toBe('');
	});
});

describe('extractThinkingFromContent', () => {
	it('should extract from additional_kwargs.reasoning_content', () => {
		expect(extractThinkingFromContent('text', { reasoning_content: 'My reasoning' })).toBe(
			'My reasoning'
		);
	});

	it('should return undefined for empty reasoning_content', () => {
		expect(extractThinkingFromContent('text', { reasoning_content: '' })).toBeUndefined();
	});

	it('should extract from content array thinking blocks', () => {
		const content = [
			{ type: 'thinking', thinking: 'Let me think' },
			{ type: 'text', text: 'Answer' }
		];
		expect(extractThinkingFromContent(content)).toBe('Let me think');
	});

	it('should prefer additional_kwargs over content array', () => {
		const content = [{ type: 'thinking', thinking: 'From content' }];
		expect(extractThinkingFromContent(content, { reasoning_content: 'From kwargs' })).toBe(
			'From kwargs'
		);
	});

	it('should return undefined when no thinking present', () => {
		expect(extractThinkingFromContent('plain text')).toBeUndefined();
		expect(extractThinkingFromContent([{ type: 'text', text: 'Answer' }])).toBeUndefined();
	});

	it('should return undefined for null/undefined content with no kwargs', () => {
		expect(extractThinkingFromContent(null)).toBeUndefined();
	});
});

describe('convertThreadMessages', () => {
	it('should convert array of thread messages', () => {
		const items = [
			{ type: 'human', content: 'Hello', id: 'msg-001' },
			{ type: 'ai', content: 'Hi there!', id: 'msg-002' },
			{
				type: 'tool',
				content: 'Result',
				name: 'tool1',
				tool_call_id: 'call-001',
				status: 'success'
			}
		];

		const results = convertThreadMessages(items);

		expect(results).toHaveLength(3);
		expect(results[0].type).toBe('user');
		expect(results[1].type).toBe('ai');
		expect(results[2].type).toBe('tool');
	});

	it('should handle empty array', () => {
		const results = convertThreadMessages([]);

		expect(results).toHaveLength(0);
	});
});
