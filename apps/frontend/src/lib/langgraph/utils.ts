import type {
	Message as LangGraphMessage,
	AIMessage as LangGraphAIMessage,
	ToolMessage as LangGraphToolMessage
} from '@langchain/langgraph-sdk';

import { InvalidData } from './errors';
import type { Message, UserMessage, AIMessage, ToolMessage } from './types';

interface FixedAIMessage extends Omit<LangGraphAIMessage, 'type'> {
	type: 'AIMessageChunk';
}

type FixedMessage = FixedAIMessage | LangGraphToolMessage;

/**
 * Converts a single LangGraph message to our internal Message format.
 * Handles conversion of thread history messages (human, ai, tool types).
 *
 * @param item - Raw message object from LangGraph thread values
 * @returns Converted Message
 */
export function convertThreadMessage(item: Record<string, unknown>): Message {
	if (item.type === 'human') {
		return {
			type: 'user',
			text: typeof item.content === 'string' ? item.content : '',
			id: (item.id as string) || crypto.randomUUID()
		} as UserMessage;
	} else if (item.type === 'ai') {
		return {
			type: 'ai',
			text: typeof item.content === 'string' ? item.content : '',
			id: (item.id as string) || crypto.randomUUID()
		} as AIMessage;
	} else if (item.type === 'tool') {
		return {
			type: 'tool',
			text: typeof item.content === 'string' ? item.content : '',
			tool_name: (item.name as string) || '',
			id: (item.tool_call_id as string) || (item.id as string) || crypto.randomUUID(),
			status: (item.status as 'success' | 'error') || 'success'
		} as ToolMessage;
	}
	throw new InvalidData(`Unexpected message type: ${item.type}`, item);
}

/**
 * Converts thread history messages to our internal Message format.
 *
 * @param threadMessages - Array of raw message objects from thread.values.messages
 * @returns Array of converted Messages
 */
export function convertThreadMessages(threadMessages: Record<string, unknown>[]): Message[] {
	return threadMessages.map((item) => convertThreadMessage(item));
}

/**
 * Converts a LangGraph message from the streaming response to our internal Message format.
 * Handles streaming messages (AIMessageChunk, tool) and yields individual messages and tool calls.
 * For AI messages, also yields any associated tool calls as separate messages.
 *
 * @param m - LangGraph message from streaming response
 * @yields Message objects in our internal format
 * @throws InvalidData if message is malformed or invalid
 */
export function* YieldMessages(m: LangGraphMessage): Generator<Message, void, unknown> {
	const fixed = m as FixedMessage;

	if (!fixed.id) {
		throw new InvalidData('Message id not defined.', fixed);
	}

	switch (fixed.type) {
		// In type this is 'ai' but LangGraph actually returns 'AIMessageChunk'.
		case 'AIMessageChunk':
			if (typeof fixed.content !== 'string') {
				throw new InvalidData('Message content is not a string.', fixed);
			}

			yield { type: 'ai', text: fixed.content, id: fixed.id };

			if (fixed.tool_calls === undefined) {
				throw new InvalidData('tool_calls cannot be undefined', fixed);
			}
			for (const tool_call of fixed.tool_calls) {
				console.warn('Processing tool call:', tool_call);

				if (tool_call.name === '') {
					console.warn('Ignoring tool_call with empty name', fixed);
					continue;
				}

				if (typeof tool_call.id !== 'string') {
					throw new InvalidData('No id in tool_call.', fixed);
				}

				yield {
					type: 'tool',
					tool_name: tool_call.name,
					payload: tool_call.args,
					id: tool_call.id,
					text: ''
				};
			}

			break;
		case 'tool':
			if (typeof fixed.content !== 'string') {
				throw new InvalidData('Message content is not a string.', fixed);
			}

			if (typeof fixed.name !== 'string') {
				throw new InvalidData('Tool name is not set.', fixed);
			}

			if (fixed.status == undefined) {
				throw new InvalidData('Tool status not present.', fixed);
			}

			yield {
				type: 'tool',
				tool_name: fixed.name,
				id: fixed.tool_call_id,
				text: fixed.content,
				status: fixed.status
			};

			break;
		default:
			throw new InvalidData(`Unexpected message on: ${fixed}`, fixed);
	}
}
