import type {
	Message as LangGraphMessage,
	AIMessage as LangGraphAIMessage,
	ToolMessage as LangGraphToolMessage
} from '@langchain/langgraph-sdk';

import { InvalidData } from './errors';
import type { Message } from './types';

interface FixedAIMessage extends Omit<LangGraphAIMessage, 'type'> {
	type: 'AIMessageChunk';
}

type FixedMessage = FixedAIMessage | LangGraphToolMessage;

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
