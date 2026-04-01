import { describe, it, expect } from 'vitest';
import { convertThreadMessage } from './utils';
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
});