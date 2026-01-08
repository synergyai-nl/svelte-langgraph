import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from '@langchain/langgraph-sdk';
import { streamAnswer } from './streamAnswer';
import { InvalidData, StreamError } from './errors';
import {
	simpleAIResponse,
	incrementalAIResponse,
	toolInvocationResponse,
	toolResultSuccess,
	toolResultError,
	completeToolFlow,
	multipleToolCalls,
	metadataOnlyEvents,
	mixedStreamWithMetadata,
	emptyDataPayload,
	nullDataPayload,
	missingDataPayload,
	streamErrorEvent,
	missingMessageId,
	nonStringContent,
	missingToolCalls,
	toolCallEmptyName,
	toolCallMissingId,
	toolResultMissingStatus,
	toolResultMissingName,
	unexpectedMessageType,
	type StreamChunk
} from '../../../tests/fixtures/streaming-transcripts';

function createMockClient(chunks: StreamChunk[]): Client {
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

describe('streamAnswer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('streaming assistant text', () => {
		it('emits AI messages from simple responses', async () => {
			const client = createMockClient(simpleAIResponse);
			const messages = await collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1');

			expect(messages).toHaveLength(1);
			expect(messages[0]).toEqual({
				type: 'ai',
				id: 'ai-msg-001',
				text: 'Hello! How can I help you today?'
			});
		});

		it('emits incremental AI messages preserving ordering across multiple chunks', async () => {
			const client = createMockClient(incrementalAIResponse);
			const messages = await collectMessages(
				client,
				'thread-1',
				'assistant-1',
				'Weather?',
				'msg-1'
			);

			expect(messages).toHaveLength(3);
			expect(messages[0]).toEqual({
				type: 'ai',
				id: 'ai-msg-002',
				text: 'The weather '
			});
			expect(messages[1]).toEqual({
				type: 'ai',
				id: 'ai-msg-002',
				text: 'today is '
			});
			expect(messages[2]).toEqual({
				type: 'ai',
				id: 'ai-msg-002',
				text: 'sunny and warm.'
			});
		});

		it('preserves message IDs across incremental chunks for proper aggregation', async () => {
			const client = createMockClient(incrementalAIResponse);
			const messages = await collectMessages(
				client,
				'thread-1',
				'assistant-1',
				'Weather?',
				'msg-1'
			);

			const ids = messages.map((m) => m.id);
			expect(ids).toEqual(['ai-msg-002', 'ai-msg-002', 'ai-msg-002']);
		});
	});

	describe('tool invocations', () => {
		it('emits structured tool messages with tool name and arguments', async () => {
			const client = createMockClient(toolInvocationResponse);
			const messages = await collectMessages(
				client,
				'thread-1',
				'assistant-1',
				'Check weather',
				'msg-1'
			);

			expect(messages).toHaveLength(2);
			expect(messages[0]).toEqual({
				type: 'ai',
				id: 'ai-msg-003',
				text: 'Let me check the weather for you.'
			});
			expect(messages[1]).toEqual({
				type: 'tool',
				id: 'tool-call-001',
				tool_name: 'get_weather',
				payload: { location: 'San Francisco', unit: 'celsius' },
				text: ''
			});
		});

		it('emits multiple tool calls from a single AI message', async () => {
			const client = createMockClient(multipleToolCalls);
			const messages = await collectMessages(
				client,
				'thread-1',
				'assistant-1',
				'Compare weather',
				'msg-1'
			);

			expect(messages).toHaveLength(3);
			expect(messages[0].type).toBe('ai');
			expect(messages[1]).toEqual({
				type: 'tool',
				id: 'tool-call-004',
				tool_name: 'get_weather',
				payload: { location: 'London' },
				text: ''
			});
			expect(messages[2]).toEqual({
				type: 'tool',
				id: 'tool-call-005',
				tool_name: 'get_weather',
				payload: { location: 'Paris' },
				text: ''
			});
		});

		it('ignores tool calls with empty names', async () => {
			const client = createMockClient(toolCallEmptyName);
			const messages = await collectMessages(client, 'thread-1', 'assistant-1', 'Process', 'msg-1');

			expect(messages).toHaveLength(1);
			expect(messages[0].type).toBe('ai');
		});
	});

	describe('tool results', () => {
		it('emits tool result messages with success status and output', async () => {
			const client = createMockClient(toolResultSuccess);
			const messages = await collectMessages(
				client,
				'thread-1',
				'assistant-1',
				'Get result',
				'msg-1'
			);

			expect(messages).toHaveLength(1);
			expect(messages[0]).toEqual({
				type: 'tool',
				id: 'tool-call-001',
				tool_name: 'get_weather',
				text: '{"temperature": 22, "condition": "sunny"}',
				status: 'success'
			});
		});

		it('emits tool result messages with error status', async () => {
			const client = createMockClient(toolResultError);
			const messages = await collectMessages(
				client,
				'thread-1',
				'assistant-1',
				'Get result',
				'msg-1'
			);

			expect(messages).toHaveLength(1);
			expect(messages[0]).toEqual({
				type: 'tool',
				id: 'tool-call-002',
				tool_name: 'get_weather',
				text: 'Error: Location not found',
				status: 'error'
			});
		});

		it('handles complete tool flow: AI text -> tool call -> tool result -> AI response', async () => {
			const client = createMockClient(completeToolFlow);
			const messages = await collectMessages(
				client,
				'thread-1',
				'assistant-1',
				'Weather in NY',
				'msg-1'
			);

			expect(messages).toHaveLength(4);
			expect(messages[0].type).toBe('ai');
			expect(messages[0].text).toBe("I'll look up the weather.");
			expect(messages[1].type).toBe('tool');
			expect((messages[1] as { tool_name: string }).tool_name).toBe('get_weather');
			expect(messages[2].type).toBe('tool');
			expect((messages[2] as { status: string }).status).toBe('success');
			expect(messages[3].type).toBe('ai');
			expect(messages[3].text).toBe("It's 18°C and cloudy in New York.");
		});
	});

	describe('metadata-only / non-user-visible events', () => {
		it('ignores metadata events and does not produce chat messages', async () => {
			const client = createMockClient(metadataOnlyEvents);
			const messages = await collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1');

			expect(messages).toHaveLength(0);
		});

		it('filters out metadata events while preserving message events', async () => {
			const client = createMockClient(mixedStreamWithMetadata);
			const messages = await collectMessages(client, 'thread-1', 'assistant-1', 'Hello', 'msg-1');

			expect(messages).toHaveLength(1);
			expect(messages[0]).toEqual({
				type: 'ai',
				id: 'ai-msg-007',
				text: 'Processing your request.'
			});
		});
	});

	describe('malformed or empty stream payloads', () => {
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
	});

	describe('explicit stream error events', () => {
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
	});

	describe('client integration', () => {
		it('calls client.runs.stream with correct parameters', async () => {
			const client = createMockClient(simpleAIResponse);
			await collectMessages(client, 'thread-123', 'assistant-456', 'Test input', 'msg-789');

			expect(client.runs.stream).toHaveBeenCalledWith('thread-123', 'assistant-456', {
				input: {
					messages: [{ type: 'human', content: 'Test input', id: 'msg-789' }]
				},
				streamMode: 'messages-tuple'
			});
		});
	});
});
