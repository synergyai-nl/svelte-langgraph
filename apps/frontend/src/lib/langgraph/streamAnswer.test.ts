import { describe, it, expect, vi } from 'vitest';
import { streamAnswer } from './streamAnswer';
import { InvalidData, StreamError } from './errors';
import type { Client, HumanMessage } from '@langchain/langgraph-sdk';

import simpleTextChunks from '../../../tests/fixtures/langgraph/simple-text-chunks.json';
import toolUseWeatherChunks from '../../../tests/fixtures/langgraph/tool-use-weather-chunks.json';
import multiPartChunks from '../../../tests/fixtures/langgraph/multi-part-chunks.json';

function humanMsg(content: string, id: string): HumanMessage {
	return { type: 'human', content, id };
}

function makeClient(chunks: unknown[]): Client {
	return {
		runs: {
			stream: vi.fn().mockImplementation(async function* () {
				for (const chunk of chunks) {
					yield chunk;
				}
			})
		}
	} as unknown as Client;
}

describe('streamAnswer with real VCR-recorded responses', () => {
	it('should parse simple text response from real API recording', async () => {
		const results = [];
		for await (const chunk of streamAnswer(
			makeClient(simpleTextChunks),
			'thread-123',
			'assistant-456',
			humanMsg('What is 2+2?', 'user-msg-1'),
			new AbortController().signal
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
		const results = [];
		for await (const chunk of streamAnswer(
			makeClient(toolUseWeatherChunks),
			'thread-123',
			'assistant-456',
			humanMsg('What is the weather in Amsterdam?', 'user-msg-2'),
			new AbortController().signal
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
		const results = [];
		for await (const chunk of streamAnswer(
			makeClient(multiPartChunks),
			'thread-123',
			'assistant-456',
			humanMsg(
				'Explain what 5+3 equals and then tell me what the weather is like in Paris',
				'user-msg-3'
			),
			new AbortController().signal
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
		const results = [];
		for await (const chunk of streamAnswer(
			makeClient(simpleTextChunks),
			'thread-123',
			'assistant-456',
			humanMsg('Test', 'user-msg-4'),
			new AbortController().signal
		)) {
			results.push(chunk);
		}

		expect(results.every((r) => r.type === 'ai' || r.type === 'tool')).toBe(true);
	});

	it('should correctly aggregate streaming text chunks', async () => {
		const results = [];
		for await (const chunk of streamAnswer(
			makeClient(simpleTextChunks),
			'thread-123',
			'assistant-456',
			humanMsg('What is 2+2?', 'user-msg-5'),
			new AbortController().signal
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
		const results = [];
		for await (const chunk of streamAnswer(
			makeClient(toolUseWeatherChunks),
			'thread-123',
			'assistant-456',
			humanMsg('Weather?', 'user-msg-6'),
			new AbortController().signal
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
		const mockClient = { runs: { stream: streamMock } } as unknown as Client;

		const signal = new AbortController().signal;
		const inputMessage = humanMsg('Test input', 'msg-id-123');
		const results = [];
		for await (const chunk of streamAnswer(
			mockClient,
			'thread-abc',
			'assistant-xyz',
			inputMessage,
			signal
		)) {
			results.push(chunk);
		}

		expect(streamMock).toHaveBeenCalledWith('thread-abc', 'assistant-xyz', {
			input: { messages: [inputMessage] },
			streamMode: 'messages-tuple',
			signal
		});
	});
});

describe('streamAnswer error handling', () => {
	it('should throw InvalidData for chunks with null data', async () => {
		const generator = streamAnswer(
			makeClient([{ event: 'messages', data: null }]),
			'thread-123',
			'assistant-456',
			humanMsg('Invalid test', 'user-msg-7'),
			new AbortController().signal
		);

		await expect(async () => {
			for await (const chunk of generator) {
				void chunk;
			}
		}).rejects.toThrow(InvalidData);
	});

	it('should throw InvalidData for chunks with empty data array', async () => {
		const generator = streamAnswer(
			makeClient([{ event: 'messages', data: [] }]),
			'thread-123',
			'assistant-456',
			humanMsg('Invalid test', 'user-msg-8'),
			new AbortController().signal
		);

		await expect(async () => {
			for await (const chunk of generator) {
				void chunk;
			}
		}).rejects.toThrow(InvalidData);
	});

	it('should throw StreamError for error events', async () => {
		const generator = streamAnswer(
			makeClient([
				{ event: 'error', data: { message: 'API rate limit exceeded', code: 'RATE_LIMIT' } }
			]),
			'thread-123',
			'assistant-456',
			humanMsg('Error test', 'user-msg-9'),
			new AbortController().signal
		);

		await expect(async () => {
			for await (const chunk of generator) {
				void chunk;
			}
		}).rejects.toThrow(StreamError);
	});

	it('should process valid chunks before throwing on error event', async () => {
		const mixedChunks = [
			{
				event: 'messages',
				data: [{ content: 'Starting...', type: 'AIMessageChunk', id: 'msg-001', tool_calls: [] }]
			},
			{ event: 'error', data: { message: 'API rate limit exceeded', code: 'RATE_LIMIT' } }
		];

		const results: unknown[] = [];
		await expect(async () => {
			for await (const chunk of streamAnswer(
				makeClient(mixedChunks),
				'thread-123',
				'assistant-456',
				humanMsg('Mixed test', 'user-msg-10'),
				new AbortController().signal
			)) {
				results.push(chunk);
			}
		}).rejects.toThrow(StreamError);

		expect(results.length).toBe(1);
		expect(results[0]).toMatchObject({ type: 'ai', text: 'Starting...' });
	});
});
