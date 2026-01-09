import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from '@langchain/langgraph-sdk';
import { streamAnswer } from './streamAnswer';
import { InvalidData, StreamError } from './errors';

// VCR-recorded fixtures imported via Vite's native JSON imports
import simpleTextChunks from '../../../tests/fixtures/langgraph/simple-text-chunks.json';
import toolUseWeatherChunks from '../../../tests/fixtures/langgraph/tool-use-weather-chunks.json';
import multiPartChunks from '../../../tests/fixtures/langgraph/multi-part-chunks.json';

// Type definitions for fixture structure
interface AIMessageChunk {
	content: string;
	type: 'AIMessageChunk';
	id: string;
	tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
	[key: string]: unknown;
}

interface ToolMessage {
	content: string;
	type: 'tool';
	name: string;
	status: string;
	tool_call_id: string;
	id: string;
	[key: string]: unknown;
}

interface FixtureChunk {
	event: string;
	data?: Array<AIMessageChunk | ToolMessage | Record<string, unknown>>;
	[key: string]: unknown;
}

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

		// Extract expected values from fixture
		const expectedMessageEvents = (simpleTextChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'AIMessageChunk'
		);
		const expectedText = expectedMessageEvents
			.map((evt) => (evt.data![0] as AIMessageChunk).content)
			.join('');
		const expectedId = expectedMessageEvents.find((evt) => evt.data?.[0])?.data![0].id as string;

		// Verify exact count matches fixture
		expect(results.length).toBe(expectedMessageEvents.length);

		// All results should be AI messages for this simple text fixture
		expect(results.every((r) => r.type === 'ai')).toBe(true);

		const aiMessages = results.filter((r) => r.type === 'ai');
		expect(aiMessages.length).toBe(expectedMessageEvents.length);

		// Verify exact text content matches fixture
		const fullText = aiMessages.map((r) => r.text).join('');
		expect(fullText).toBe(expectedText);

		// Verify all messages have the same ID (incremental chunks of same message)
		const uniqueIds = [...new Set(results.map((r) => r.id))];
		expect(uniqueIds.length).toBe(1);
		expect(uniqueIds[0]).toBe(expectedId);
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

		// Extract expected values from fixture
		const toolCallEvents = (toolUseWeatherChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'AIMessageChunk' &&
				'tool_calls' in chunk.data[0] &&
				Array.isArray(chunk.data[0].tool_calls) &&
				chunk.data[0].tool_calls.length > 0
		);
		const toolResultEvents = (toolUseWeatherChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'tool'
		);
		const aiResponseEvents = (toolUseWeatherChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'AIMessageChunk' &&
				'content' in chunk.data[0] &&
				chunk.data[0].content &&
				(!('tool_calls' in chunk.data[0]) ||
					!Array.isArray(chunk.data[0].tool_calls) ||
					chunk.data[0].tool_calls.length === 0)
		);

		const expectedToolName = (toolCallEvents[0]?.data![0] as AIMessageChunk).tool_calls?.[0]?.name;
		const expectedToolCallId = (toolCallEvents[0]?.data![0] as AIMessageChunk).tool_calls?.[0]?.id;
		const expectedToolResultContent = (toolResultEvents[0]?.data![0] as ToolMessage).content;
		const expectedToolStatus = (toolResultEvents[0]?.data![0] as ToolMessage).status;
		const expectedAiResponse = aiResponseEvents
			.map((evt) => (evt.data![0] as AIMessageChunk).content)
			.join('');

		// Verify results structure
		expect(results.length).toBeGreaterThan(0);

		const aiChunks = results.filter((r) => r.type === 'ai');
		const toolChunks = results.filter((r) => r.type === 'tool');

		expect(aiChunks.length).toBeGreaterThan(0);
		expect(toolChunks.length).toBeGreaterThan(0);

		// Verify specific tool name from fixture
		const toolWithName = toolChunks.find((t) => t.tool_name);
		expect(toolWithName).toBeDefined();
		expect(toolWithName?.tool_name).toBe(expectedToolName);

		// Verify tool call ID from fixture
		const toolWithId = toolChunks.find((t) => t.id === expectedToolCallId);
		expect(toolWithId).toBeDefined();
		expect(toolWithId?.id).toBe(expectedToolCallId);

		// Verify tool result contains expected content and status
		const toolResult = toolChunks.find((t) => 'status' in t);
		expect(toolResult).toBeDefined();
		expect(toolResult?.tool_name).toBe(expectedToolName);
		expect((toolResult as { status: string }).status).toBe(expectedToolStatus);
		expect((toolResult as { text: string }).text).toBe(expectedToolResultContent);

		// Verify AI response text matches fixture
		const aiText = aiChunks.map((m) => m.text).join('');
		expect(aiText).toBe(expectedAiResponse);
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

		// Extract expected values from fixture
		const toolCallEvents = (multiPartChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'AIMessageChunk' &&
				'tool_calls' in chunk.data[0] &&
				Array.isArray(chunk.data[0].tool_calls) &&
				chunk.data[0].tool_calls.length > 0
		);
		const toolResultEvents = (multiPartChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'tool'
		);
		const aiResponseEvents = (multiPartChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'AIMessageChunk' &&
				'content' in chunk.data[0] &&
				chunk.data[0].content
		);

		const expectedToolName = (toolCallEvents[0]?.data![0] as AIMessageChunk).tool_calls?.[0]?.name;
		const expectedToolStatus = (toolResultEvents[0]?.data![0] as ToolMessage).status;
		const expectedToolResultContent = (toolResultEvents[0]?.data![0] as ToolMessage).content;
		const expectedAiResponse = aiResponseEvents
			.map((evt) => (evt.data![0] as AIMessageChunk).content)
			.join('');

		// Verify structure
		expect(results.length).toBeGreaterThan(0);

		const aiChunks = results.filter((r) => r.type === 'ai');
		const toolChunks = results.filter((r) => r.type === 'tool');

		expect(aiChunks.length).toBeGreaterThan(0);
		expect(toolChunks.length).toBeGreaterThan(0);

		// Verify all chunks have required fields
		results.forEach((chunk) => {
			expect(chunk.type).toBeDefined();
			expect(chunk.id).toBeDefined();
		});

		// Verify AI messages contain string text
		aiChunks.forEach((chunk) => {
			expect(typeof chunk.text).toBe('string');
		});

		// Verify tool chunks have specific values from fixture
		toolChunks.forEach((chunk) => {
			expect(chunk.tool_name).toBeDefined();
			expect(chunk.tool_name).toBe(expectedToolName);
		});

		// Verify tool result has expected status and content
		const toolResult = toolChunks.find((t) => 'status' in t);
		expect(toolResult).toBeDefined();
		expect((toolResult as { status: string }).status).toBe(expectedToolStatus);
		expect((toolResult as { text: string }).text).toBe(expectedToolResultContent);

		// Verify full AI response matches fixture
		const fullAiText = aiChunks.map((m) => m.text).join('');
		expect(fullAiText).toBe(expectedAiResponse);
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

		// Extract expected values from fixture
		const expectedMessageEvents = (simpleTextChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'AIMessageChunk'
		);
		const expectedText = expectedMessageEvents
			.map((evt) => (evt.data![0] as AIMessageChunk).content)
			.join('');

		const aiChunks = results.filter((r) => r.type === 'ai');
		expect(aiChunks.length).toBe(expectedMessageEvents.length);

		// Verify each chunk is a string
		aiChunks.forEach((chunk) => {
			expect(typeof chunk.text).toBe('string');
		});

		// Verify aggregated text matches fixture
		const fullText = aiChunks.map((r) => r.text).join('');
		expect(fullText).toBe(expectedText);
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

		// Extract expected tool name from fixture
		const toolCallEvents = (toolUseWeatherChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'AIMessageChunk' &&
				'tool_calls' in chunk.data[0] &&
				Array.isArray(chunk.data[0].tool_calls) &&
				chunk.data[0].tool_calls.length > 0
		);
		const expectedToolName = (toolCallEvents[0]?.data![0] as AIMessageChunk).tool_calls?.[0]?.name;

		const toolChunks = results.filter((r) => r.type === 'tool');

		expect(toolChunks.length).toBeGreaterThan(0);
		toolChunks.forEach((tool) => {
			expect(tool.tool_name).toBeDefined();
			expect(typeof tool.tool_name).toBe('string');
			expect(tool.tool_name).toBe(expectedToolName);
		});
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

		// Verify ordering: concatenating text in order should produce the expected result
		const concatenatedText = aiMessages.map((m) => m.text).join('');
		expect(concatenatedText).toBe('2 + 2 equals 4.');

		// Verify individual chunks are emitted in the expected order
		const nonEmptyChunks = aiMessages.filter((m) => m.text !== '');
		expect(nonEmptyChunks.map((m) => m.text)).toEqual([
			'2',
			' +',
			' ',
			'2',
			' equals',
			' ',
			'4',
			'.'
		]);
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

		// Extract expected values from fixture
		const toolCallEvents = (toolUseWeatherChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'AIMessageChunk' &&
				'tool_calls' in chunk.data[0] &&
				Array.isArray(chunk.data[0].tool_calls) &&
				chunk.data[0].tool_calls.length > 0
		);
		const expectedToolName = (toolCallEvents[0]?.data![0] as AIMessageChunk).tool_calls?.[0]?.name;
		const expectedToolId = (toolCallEvents[0]?.data![0] as AIMessageChunk).tool_calls?.[0]?.id;

		const toolInvocations = results.filter(
			(r) => r.type === 'tool' && (r.payload !== undefined || r.text === '')
		);

		expect(toolInvocations.length).toBeGreaterThan(0);
		toolInvocations.forEach((tool) => {
			expect(tool.id).toBeDefined();
			expect((tool as { tool_name: string }).tool_name).toBeDefined();
			expect((tool as { tool_name: string }).tool_name).toBe(expectedToolName);
			expect(tool.id).toBe(expectedToolId);
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

		// Extract expected values from fixture
		const toolResultEvents = (multiPartChunks as FixtureChunk[]).filter(
			(chunk) =>
				chunk.event === 'messages' &&
				chunk.data?.[0] &&
				'type' in chunk.data[0] &&
				chunk.data[0].type === 'tool'
		);
		const expectedToolName = (toolResultEvents[0]?.data![0] as ToolMessage).name;
		const expectedStatus = (toolResultEvents[0]?.data![0] as ToolMessage).status;
		const expectedToolCallId = (toolResultEvents[0]?.data![0] as ToolMessage).tool_call_id;

		// Look for tool results (have status field)
		const toolResults = results.filter(
			(r) => r.type === 'tool' && 'status' in r && r.status !== undefined
		);

		expect(toolResults.length).toBeGreaterThan(0);
		toolResults.forEach((tool) => {
			expect((tool as { status: string }).status).toBeDefined();
			expect((tool as { status: string }).status).toBe(expectedStatus);
			expect((tool as { tool_name: string }).tool_name).toBeDefined();
			expect((tool as { tool_name: string }).tool_name).toBe(expectedToolName);
			expect(tool.id).toBeDefined();
			expect(tool.id).toBe(expectedToolCallId);
		});
	});

	it('preserves ordering across tool invocation, tool result, and AI response', async () => {
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
			'Explain what 5+3 equals and then tell me what the weather is like in Paris',
			'msg-1'
		)) {
			results.push(chunk);
		}

		// Find the tool invocation (has tool_name but no status)
		const toolInvocationIndex = results.findIndex(
			(r) =>
				r.type === 'tool' &&
				(r as { tool_name?: string }).tool_name === 'get_weather' &&
				!('status' in r && r.status)
		);

		// Find the tool result (has status)
		const toolResultIndex = results.findIndex(
			(r) => r.type === 'tool' && 'status' in r && (r as { status?: string }).status === 'success'
		);

		// Tool invocation should come before tool result
		expect(toolInvocationIndex).toBeGreaterThanOrEqual(0);
		expect(toolResultIndex).toBeGreaterThan(toolInvocationIndex);

		// Find AI messages that come after the tool result
		const aiMessagesAfterTool = results.slice(toolResultIndex + 1).filter((r) => r.type === 'ai');

		expect(aiMessagesAfterTool.length).toBeGreaterThan(0);

		// The AI messages after the tool should form the expected response
		const concatenatedText = aiMessagesAfterTool.map((m) => m.text).join('');
		expect(concatenatedText).toBe(
			"5 + 3 equals 8. \n\nAs for the weather in Paris, it's always sunny!"
		);

		// AI messages after tool result should have a different ID than any AI messages before
		const aiIdsBeforeTool = results
			.slice(0, toolResultIndex)
			.filter((r) => r.type === 'ai')
			.map((r) => r.id);
		const aiIdsAfterTool = [...new Set(aiMessagesAfterTool.map((r) => r.id))];

		// There should be exactly one unique AI message ID after the tool result
		expect(aiIdsAfterTool.length).toBe(1);

		// The ID should be different from any AI message IDs before the tool (if any exist)
		if (aiIdsBeforeTool.length > 0) {
			expect(aiIdsAfterTool[0]).not.toBe(aiIdsBeforeTool[0]);
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
