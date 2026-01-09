import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from '@langchain/langgraph-sdk';
import { streamAnswer } from './streamAnswer';
import { InvalidData, StreamError } from './errors';

// VCR-recorded fixtures imported via Vite's native JSON imports
import simpleTextChunks from '../../../tests/fixtures/langgraph/simple-text-chunks.json';
import toolUseWeatherChunks from '../../../tests/fixtures/langgraph/tool-use-weather-chunks.json';
import multiPartChunks from '../../../tests/fixtures/langgraph/multi-part-chunks.json';

// Synthetic fixtures for error handling and edge case tests
import {
	emptyDataPayload,
	nullDataPayload,
	missingDataPayload,
	streamErrorEvent,
	missingMessageId,
	nonStringContent,
	missingToolCalls,
	toolCallMissingId,
	toolResultMissingStatus,
	toolResultMissingName,
	unexpectedMessageType,
	type StreamChunk
} from '../../../tests/fixtures/streaming-transcripts';

function createMockClient(chunks: StreamChunk[] | unknown[]): Client {
	return {
		runs: {
			stream: vi.fn().mockReturnValue({
				async *[Symbol.asyncIterator]() {
					for (const chunk of chunks) {
						yield chunk;
					}
				}
			})
		}
	} as unknown as Client;
}

async function collectMessages(
	client: Client,
	threadId: string,
	assistantId: string,
	input: string,
	messageId: string
) {
	const messages = [];
	for await (const message of streamAnswer(client, threadId, assistantId, input, messageId)) {
		messages.push(message);
	}
	return messages;
}

describe('streamAnswer with real VCR-recorded responses', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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

	it('emits incremental AI messages preserving ordering across multiple chunks', async () => {
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
			'thread-1',
			'assistant-1',
			'What is 2+2?',
			'msg-1'
		)) {
			results.push(chunk);
		}

		// Verify incremental chunks are yielded in order
		const aiMessages = results.filter((r) => r.type === 'ai');
		expect(aiMessages.length).toBeGreaterThan(1);

		// All messages should share the same ID (same message being built up)
		const ids = [...new Set(aiMessages.map((m) => m.id))];
		expect(ids.length).toBe(1);
	});

	it('verifies tool invocations contain tool_name, args/payload, and id', async () => {
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
			'thread-1',
			'assistant-1',
			'Weather in Amsterdam?',
			'msg-1'
		)) {
			results.push(chunk);
		}

		const toolInvocations = results.filter(
			(r) => r.type === 'tool' && (r.payload !== undefined || r.text === '')
		);

		expect(toolInvocations.length).toBeGreaterThan(0);
		toolInvocations.forEach((tool) => {
			expect(tool.id).toBeDefined();
			expect((tool as { tool_name: string }).tool_name).toBeDefined();
		});
	});

	it('verifies tool results have status field', async () => {
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
			'thread-1',
			'assistant-1',
			'Weather and math',
			'msg-1'
		)) {
			results.push(chunk);
		}

		// Look for tool results (have status field)
		const toolResults = results.filter(
			(r) => r.type === 'tool' && 'status' in r && r.status !== undefined
		);

		// If there are tool results, verify they have required fields
		if (toolResults.length > 0) {
			toolResults.forEach((tool) => {
				expect((tool as { status: string }).status).toBeDefined();
				expect(['success', 'error']).toContain((tool as { status: string }).status);
				expect((tool as { tool_name: string }).tool_name).toBeDefined();
				expect(tool.id).toBeDefined();
			});
		}
	});
});

describe('streamAnswer error handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('throws InvalidData error for empty data array', async () => {
		const client = createMockClient(emptyDataPayload);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(InvalidData);
	});

	it('throws InvalidData error for null data payload', async () => {
		const client = createMockClient(nullDataPayload);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(InvalidData);
	});

	it('throws InvalidData error for missing data payload', async () => {
		const client = createMockClient(missingDataPayload);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(InvalidData);
	});

	it('throws InvalidData error for missing message id', async () => {
		const client = createMockClient(missingMessageId);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(InvalidData);
	});

	it('throws InvalidData error for non-string content', async () => {
		const client = createMockClient(nonStringContent);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(InvalidData);
	});

	it('throws InvalidData error for missing tool_calls in AI message', async () => {
		const client = createMockClient(missingToolCalls);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(InvalidData);
	});

	it('throws InvalidData error for tool call with missing id', async () => {
		const client = createMockClient(toolCallMissingId);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(InvalidData);
	});

	it('throws InvalidData error for tool result with missing status', async () => {
		const client = createMockClient(toolResultMissingStatus);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(InvalidData);
	});

	it('throws InvalidData error for tool result with missing name', async () => {
		const client = createMockClient(toolResultMissingName);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(InvalidData);
	});

	it('throws InvalidData error for unexpected message type', async () => {
		const client = createMockClient(unexpectedMessageType);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(InvalidData);
	});

	it('throws StreamError for error events', async () => {
		const client = createMockClient(streamErrorEvent);

		await expect(
			collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1')
		).rejects.toThrow(StreamError);
	});

	it('StreamError contains the error event data', async () => {
		const client = createMockClient(streamErrorEvent);

		try {
			await collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1');
			expect.fail('Should have thrown StreamError');
		} catch (error) {
			expect(error).toBeInstanceOf(StreamError);
			expect((error as StreamError).err_event).toBeDefined();
		}
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
