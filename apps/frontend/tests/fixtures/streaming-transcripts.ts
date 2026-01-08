/**
 * Test fixtures representing realistic LangGraph streaming event transcripts.
 * These fixtures are based on the actual event shapes returned by the LangGraph SDK
 * when using streamMode: 'messages-tuple'.
 *
 * Note: The LangGraph SDK types don't include 'AIMessageChunk' as a valid type,
 * but the actual streaming response uses this type. We define custom types here
 * to match the actual runtime behavior.
 */

interface ToolCall {
	id?: string;
	name: string;
	args: Record<string, unknown>;
}

interface AIMessageChunkData {
	type: 'AIMessageChunk';
	id?: string;
	content: string | Record<string, unknown>;
	tool_calls?: ToolCall[];
}

interface ToolMessageData {
	type: 'tool';
	id: string;
	tool_call_id: string;
	name?: string;
	content: string | Record<string, unknown>;
	status?: 'success' | 'error';
}

interface UnknownMessageData {
	type: string;
	id?: string;
	content?: string | Record<string, unknown>;
}

type StreamMessageData = AIMessageChunkData | ToolMessageData | UnknownMessageData;

/**
 * Represents a streaming chunk from the LangGraph API.
 * The event type determines how the chunk should be processed.
 */
export interface StreamChunk {
	event: 'messages' | 'metadata' | 'error' | 'end' | string;
	data?: [StreamMessageData, ...unknown[]] | StreamMessageData[] | Record<string, unknown> | null;
}

/**
 * Simple AI text response - single chunk with complete text.
 * Represents a short AI response that arrives in one piece.
 */
export const simpleAIResponse: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-001',
				content: 'Hello! How can I help you today?',
				tool_calls: []
			}
		]
	}
];

/**
 * Incremental AI text response - multiple chunks building up a response.
 * Represents streaming text that arrives in multiple pieces.
 */
export const incrementalAIResponse: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-002',
				content: 'The weather ',
				tool_calls: []
			}
		]
	},
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-002',
				content: 'today is ',
				tool_calls: []
			}
		]
	},
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-002',
				content: 'sunny and warm.',
				tool_calls: []
			}
		]
	}
];

/**
 * AI response with tool invocation.
 * Represents an AI deciding to call a tool with arguments.
 */
export const toolInvocationResponse: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-003',
				content: 'Let me check the weather for you.',
				tool_calls: [
					{
						id: 'tool-call-001',
						name: 'get_weather',
						args: { location: 'San Francisco', unit: 'celsius' }
					}
				]
			}
		]
	}
];

/**
 * Tool result response - successful tool execution.
 * Represents the result of a tool call with success status.
 */
export const toolResultSuccess: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'tool',
				id: 'tool-result-001',
				tool_call_id: 'tool-call-001',
				name: 'get_weather',
				content: '{"temperature": 22, "condition": "sunny"}',
				status: 'success'
			}
		]
	}
];

/**
 * Tool result response - failed tool execution.
 * Represents the result of a tool call with error status.
 */
export const toolResultError: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'tool',
				id: 'tool-result-002',
				tool_call_id: 'tool-call-002',
				name: 'get_weather',
				content: 'Error: Location not found',
				status: 'error'
			}
		]
	}
];

/**
 * Complete conversation flow with tool use.
 * Represents a realistic sequence: AI text -> tool call -> tool result -> AI response.
 */
export const completeToolFlow: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-004',
				content: "I'll look up the weather.",
				tool_calls: [
					{
						id: 'tool-call-003',
						name: 'get_weather',
						args: { location: 'New York' }
					}
				]
			}
		]
	},
	{
		event: 'messages',
		data: [
			{
				type: 'tool',
				id: 'tool-result-003',
				tool_call_id: 'tool-call-003',
				name: 'get_weather',
				content: '{"temperature": 18, "condition": "cloudy"}',
				status: 'success'
			}
		]
	},
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-005',
				content: "It's 18°C and cloudy in New York.",
				tool_calls: []
			}
		]
	}
];

/**
 * Multiple tool calls in a single AI message.
 * Represents an AI calling multiple tools at once.
 */
export const multipleToolCalls: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-006',
				content: 'Let me check both locations.',
				tool_calls: [
					{
						id: 'tool-call-004',
						name: 'get_weather',
						args: { location: 'London' }
					},
					{
						id: 'tool-call-005',
						name: 'get_weather',
						args: { location: 'Paris' }
					}
				]
			}
		]
	}
];

/**
 * Metadata-only events that should be ignored.
 * These events don't produce user-visible messages.
 */
export const metadataOnlyEvents: StreamChunk[] = [
	{
		event: 'metadata',
		data: { run_id: 'run-123', thread_id: 'thread-456' }
	},
	{
		event: 'end',
		data: null
	}
];

/**
 * Mixed stream with metadata and messages.
 * Represents a realistic stream with both metadata and message events.
 */
export const mixedStreamWithMetadata: StreamChunk[] = [
	{
		event: 'metadata',
		data: { run_id: 'run-789' }
	},
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-007',
				content: 'Processing your request.',
				tool_calls: []
			}
		]
	},
	{
		event: 'end',
		data: null
	}
];

/**
 * Empty data payload - should cause an error.
 */
export const emptyDataPayload: StreamChunk[] = [
	{
		event: 'messages',
		data: []
	}
];

/**
 * Null data payload - should cause an error.
 */
export const nullDataPayload: StreamChunk[] = [
	{
		event: 'messages',
		data: null
	}
];

/**
 * Missing data payload - should cause an error.
 */
export const missingDataPayload: StreamChunk[] = [
	{
		event: 'messages'
	}
];

/**
 * Explicit stream error event.
 */
export const streamErrorEvent: StreamChunk[] = [
	{
		event: 'error',
		data: {
			error: 'Internal server error',
			message: 'Failed to process request'
		}
	}
];

/**
 * AI message with missing id - should cause an error.
 */
export const missingMessageId: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				content: 'Hello',
				tool_calls: []
			}
		]
	}
];

/**
 * AI message with non-string content - should cause an error.
 */
export const nonStringContent: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-008',
				content: { text: 'Hello' },
				tool_calls: []
			}
		]
	}
];

/**
 * AI message with missing tool_calls - should cause an error.
 */
export const missingToolCalls: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-009',
				content: 'Hello'
			}
		]
	}
];

/**
 * Tool call with empty name - should be ignored.
 */
export const toolCallEmptyName: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-010',
				content: 'Processing...',
				tool_calls: [
					{
						id: 'tool-call-006',
						name: '',
						args: {}
					}
				]
			}
		]
	}
];

/**
 * Tool call with missing id - should cause an error.
 */
export const toolCallMissingId: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'AIMessageChunk',
				id: 'ai-msg-011',
				content: 'Processing...',
				tool_calls: [
					{
						name: 'get_weather',
						args: { location: 'Tokyo' }
					}
				]
			}
		]
	}
];

/**
 * Tool result with missing status - should cause an error.
 */
export const toolResultMissingStatus: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'tool',
				id: 'tool-result-004',
				tool_call_id: 'tool-call-007',
				name: 'get_weather',
				content: '{"temperature": 25}'
			}
		]
	}
];

/**
 * Tool result with missing name - should cause an error.
 */
export const toolResultMissingName: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'tool',
				id: 'tool-result-005',
				tool_call_id: 'tool-call-008',
				content: '{"temperature": 25}',
				status: 'success'
			}
		]
	}
];

/**
 * Unexpected message type - should cause an error.
 */
export const unexpectedMessageType: StreamChunk[] = [
	{
		event: 'messages',
		data: [
			{
				type: 'unknown_type',
				id: 'msg-012',
				content: 'Hello'
			}
		]
	}
];

/**
 * Thread history messages for convertThreadMessages tests.
 */
export const threadHistoryMessages = [
	{
		type: 'human',
		id: 'human-msg-001',
		content: 'What is the weather like?'
	},
	{
		type: 'ai',
		id: 'ai-msg-012',
		content: 'The weather is sunny today.'
	},
	{
		type: 'tool',
		id: 'tool-msg-001',
		tool_call_id: 'tool-call-009',
		name: 'get_weather',
		content: '{"temperature": 20}',
		status: 'success'
	}
];

/**
 * Thread history with unexpected type - should cause an error.
 */
export const threadHistoryUnexpectedType = [
	{
		type: 'system',
		id: 'system-msg-001',
		content: 'You are a helpful assistant.'
	}
];
