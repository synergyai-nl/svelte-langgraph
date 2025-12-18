import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAnswer } from './streamAnswer';
import { InvalidData, StreamError } from './errors';
import type { Client } from '@langchain/langgraph-sdk';

import simpleTextChunks from '../../../tests/fixtures/langgraph/simple-text-chunks.json';
import toolUseWeatherChunks from '../../../tests/fixtures/langgraph/tool-use-weather-chunks.json';
import multiPartChunks from '../../../tests/fixtures/langgraph/multi-part-chunks.json';

describe('streamAnswer with real VCR-recorded responses', () => {
	beforeEach(() => {
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should parse simple text response from real API recording', async () => {
		const mockClient = {
			runs: {
				stream: vi.fn().mockImplementation(async function* () {
					for (const chunk of simpleTextChunks) {
						yield chunk;
					}
				})
			}
		} as unknown as Client;

		const results = [];
		for await (const chunk of streamAnswer(
			mockClient,
			'thread-123',
			'assistant-456',
			'What is 2+2?',
			'user-msg-1'
		)) {
			results.push(chunk);
		}

		expect(results.length).toBeGreaterThan(0);
		expect(results.every((r) => r.type === 'ai' || r.type === 'tool')).toBe(true);

		const aiMessages = results.filter((r) => r.type === 'ai');
		const fullText = aiMessages.map((r) => r.text).join('');
		expect(fullText.length).toBeGreaterThan(0);

		expect(results.every((r) => r.id)).toBe(true);
	});

	it('should parse tool use from real API recording', async () => {
		const mockClient = {
			runs: {
				stream: vi.fn().mockImplementation(async function* () {
					for (const chunk of toolUseWeatherChunks) {
						yield chunk;
					}
				})
			}
		} as unknown as Client;

		const results = [];
		for await (const chunk of streamAnswer(
			mockClient,
			'thread-123',
			'assistant-456',
			'What is the weather in Amsterdam?',
			'user-msg-2'
		)) {
			results.push(chunk);
		}

		expect(results.length).toBeGreaterThan(0);

		const hasAI = results.some((r) => r.type === 'ai');
		const hasTools = results.some((r) => r.type === 'tool');

		expect(hasAI).toBe(true);
		expect(hasTools).toBe(true);

		const toolChunks = results.filter((r) => r.type === 'tool');
		expect(toolChunks.length).toBeGreaterThan(0);

		toolChunks.forEach((tool) => {
			expect(tool.tool_name).toBeDefined();
			expect(tool.id).toBeDefined();
		});
	});

	it('should parse multi-part response with text and tools from real API recording', async () => {
		const mockClient = {
			runs: {
				stream: vi.fn().mockImplementation(async function* () {
					for (const chunk of multiPartChunks) {
						yield chunk;
					}
				})
			}
		} as unknown as Client;

		const results = [];
		for await (const chunk of streamAnswer(
			mockClient,
			'thread-123',
			'assistant-456',
			'Explain what 5+3 equals and then tell me what the weather is like in Paris',
			'user-msg-3'
		)) {
			results.push(chunk);
		}

		expect(results.length).toBeGreaterThan(0);

		const aiChunks = results.filter((r) => r.type === 'ai');
		const toolChunks = results.filter((r) => r.type === 'tool');

		expect(aiChunks.length).toBeGreaterThan(0);
		expect(toolChunks.length).toBeGreaterThan(0);

		results.forEach((chunk) => {
			expect(chunk.type).toBeDefined();
			expect(chunk.id).toBeDefined();

			if (chunk.type === 'ai') {
				expect(typeof chunk.text).toBe('string');
			} else if (chunk.type === 'tool') {
				expect(chunk.tool_name).toBeDefined();
			}
		});
	});

	it('should handle metadata events in real recordings (not yield them)', async () => {
		const mockClient = {
			runs: {
				stream: vi.fn().mockImplementation(async function* () {
					for (const chunk of simpleTextChunks) {
						yield chunk;
					}
				})
			}
		} as unknown as Client;

		const results = [];
		for await (const chunk of streamAnswer(
			mockClient,
			'thread-123',
			'assistant-456',
			'Test',
			'user-msg-4'
		)) {
			results.push(chunk);
		}

		expect(results.every((r) => r.type === 'ai' || r.type === 'tool')).toBe(true);
	});

	it('should correctly aggregate streaming text chunks', async () => {
		const mockClient = {
			runs: {
				stream: vi.fn().mockImplementation(async function* () {
					for (const chunk of simpleTextChunks) {
						yield chunk;
					}
				})
			}
		} as unknown as Client;

		const results = [];
		for await (const chunk of streamAnswer(
			mockClient,
			'thread-123',
			'assistant-456',
			'What is 2+2?',
			'user-msg-5'
		)) {
			results.push(chunk);
		}

		const aiChunks = results.filter((r) => r.type === 'ai');
		expect(aiChunks.length).toBeGreaterThan(1);

		aiChunks.forEach((chunk) => {
			expect(typeof chunk.text).toBe('string');
		});

		const fullText = aiChunks.map((r) => r.text).join('');
		expect(fullText.length).toBeGreaterThan(0);
	});

	it('should handle tool_calls in message objects from real recordings', async () => {
		const mockClient = {
			runs: {
				stream: vi.fn().mockImplementation(async function* () {
					for (const chunk of toolUseWeatherChunks) {
						yield chunk;
					}
				})
			}
		} as unknown as Client;

		const results = [];
		for await (const chunk of streamAnswer(
			mockClient,
			'thread-123',
			'assistant-456',
			'Weather?',
			'user-msg-6'
		)) {
			results.push(chunk);
		}

		const toolChunks = results.filter((r) => r.type === 'tool');

		if (toolChunks.length > 0) {
			toolChunks.forEach((tool) => {
				expect(tool.tool_name).toBeDefined();
				expect(typeof tool.tool_name).toBe('string');
			});
		}
	});

	it('should pass correct parameters to client.runs.stream', async () => {
		const streamMock = vi.fn().mockImplementation(async function* () {
			for (const chunk of simpleTextChunks) {
				yield chunk;
			}
		});

		const mockClient = {
			runs: {
				stream: streamMock
			}
		} as unknown as Client;

		const results = [];
		for await (const chunk of streamAnswer(
			mockClient,
			'thread-abc',
			'assistant-xyz',
			'Test input',
			'msg-id-123'
		)) {
			results.push(chunk);
		}

		expect(streamMock).toHaveBeenCalledWith('thread-abc', 'assistant-xyz', {
			input: {
				messages: [{ type: 'human', content: 'Test input', id: 'msg-id-123' }]
			},
			streamMode: 'messages-tuple'
		});
	});
});

describe('streamAnswer error handling', () => {
	beforeEach(() => {
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should throw InvalidData for chunks with null data', async () => {
		const invalidChunks = [
			{
				event: 'messages',
				data: null
			}
		];

		const mockClient = {
			runs: {
				stream: vi.fn().mockImplementation(async function* () {
					for (const chunk of invalidChunks) {
						yield chunk;
					}
				})
			}
		} as unknown as Client;

		const generator = streamAnswer(
			mockClient,
			'thread-123',
			'assistant-456',
			'Invalid test',
			'user-msg-7'
		);

		await expect(async () => {
			const results = [];
			for await (const chunk of generator) {
				results.push(chunk);
			}
		}).rejects.toThrow(InvalidData);
	});

	it('should throw InvalidData for chunks with empty data array', async () => {
		const invalidChunks = [
			{
				event: 'messages',
				data: []
			}
		];

		const mockClient = {
			runs: {
				stream: vi.fn().mockImplementation(async function* () {
					for (const chunk of invalidChunks) {
						yield chunk;
					}
				})
			}
		} as unknown as Client;

		const generator = streamAnswer(
			mockClient,
			'thread-123',
			'assistant-456',
			'Invalid test',
			'user-msg-8'
		);

		await expect(async () => {
			const results = [];
			for await (const chunk of generator) {
				results.push(chunk);
			}
		}).rejects.toThrow(InvalidData);
	});

	it('should throw StreamError for error events', async () => {
		const errorChunks = [
			{
				event: 'error',
				data: {
					message: 'API rate limit exceeded',
					code: 'RATE_LIMIT'
				}
			}
		];

		const mockClient = {
			runs: {
				stream: vi.fn().mockImplementation(async function* () {
					for (const chunk of errorChunks) {
						yield chunk;
					}
				})
			}
		} as unknown as Client;

		const generator = streamAnswer(
			mockClient,
			'thread-123',
			'assistant-456',
			'Error test',
			'user-msg-9'
		);

		await expect(async () => {
			const results = [];
			for await (const chunk of generator) {
				results.push(chunk);
			}
		}).rejects.toThrow(StreamError);
	});

	it('should process valid chunks before throwing on error event', async () => {
		const mixedChunks = [
			{
				event: 'messages',
				data: [
					{
						content: 'Starting...',
						type: 'AIMessageChunk',
						id: 'msg-001',
						tool_calls: []
					}
				]
			},
			{
				event: 'error',
				data: {
					message: 'API rate limit exceeded',
					code: 'RATE_LIMIT'
				}
			}
		];

		const mockClient = {
			runs: {
				stream: vi.fn().mockImplementation(async function* () {
					for (const chunk of mixedChunks) {
						yield chunk;
					}
				})
			}
		} as unknown as Client;

		const results: unknown[] = [];
		await expect(async () => {
			for await (const chunk of streamAnswer(
				mockClient,
				'thread-123',
				'assistant-456',
				'Mixed test',
				'user-msg-10'
			)) {
				results.push(chunk);
			}
		}).rejects.toThrow(StreamError);

		expect(results.length).toBe(1);
		expect(results[0]).toMatchObject({ type: 'ai', text: 'Starting...' });
	});
});
