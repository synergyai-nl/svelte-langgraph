import { describe, it, expect } from 'vitest';
import { convertThreadMessage, extractTextFromContent, extractThinkingFromContent } from './utils';
import { InvalidData } from './errors';

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

	it('should throw InvalidData for unexpected message type', () => {
		const item = {
			type: 'unknown',
			content: 'Hello',
			id: 'msg-001'
		};

		expect(() => convertThreadMessage(item)).toThrow(InvalidData);
		expect(() => convertThreadMessage(item)).toThrow('Unexpected message type: unknown');
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

	it('should convert ai message with reasoning content block to AIMessage', () => {
		const item = {
			type: 'ai',
			content: [
				{ type: 'reasoning', reasoning: 'Let me reason...' },
				{ type: 'text', text: 'Hello, human!' }
			],
			id: 'ai-msg-002b'
		};

		const result = convertThreadMessage(item);

		expect(result).toEqual({
			type: 'ai',
			text: 'Hello, human!',
			thinking: 'Let me reason...',
			id: 'ai-msg-002b'
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

	it('should include thinking when content is empty but reasoning is present', () => {
		const item = {
			type: 'ai',
			content: '',
			additional_kwargs: { reasoning_content: 'Still reasoning...' },
			id: 'ai-msg-004'
		};

		const result = convertThreadMessage(item);

		expect(result).toEqual({
			type: 'ai',
			text: '',
			thinking: 'Still reasoning...',
			id: 'ai-msg-004'
		});
	});

	it('should not include a thinking field when no thinking is present', () => {
		const item = {
			type: 'ai',
			content: 'Plain response',
			id: 'ai-msg-005'
		};

		const result = convertThreadMessage(item);

		expect(result).not.toHaveProperty('thinking');
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

	it('should extract from content array reasoning blocks', () => {
		const content = [
			{ type: 'reasoning', reasoning: 'Let me reason' },
			{ type: 'text', text: 'Answer' }
		];
		expect(extractThinkingFromContent(content)).toBe('Let me reason');
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
