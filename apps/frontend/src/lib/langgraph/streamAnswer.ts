import type { Message } from '$lib/langgraph/types';
import type { Client, HumanMessage } from '@langchain/langgraph-sdk';
import { YieldMessages } from './utils';
import { InvalidData, StreamError } from './errors';

export async function* streamAnswer(
	client: Client,
	threadId: string,
	assistantId: string,
	input: string,
	messageId: string
): AsyncGenerator<Message, void, unknown> {
	const input_message: HumanMessage = { type: 'human', content: input, id: messageId };

	console.debug('User input:', input_message);

	const streamResponse = client.runs.stream(threadId, assistantId, {
		input: {
			messages: [input_message]
		},
		streamMode: 'messages-tuple'
	});

	for await (const chunk of streamResponse) {
		console.debug('Got chunk:', chunk);

		switch (chunk.event) {
			case 'messages': {
				if (!chunk.data || !chunk.data[0]) {
					console.error('Invalid chunk data.', chunk);
					throw new InvalidData('Invalid chunk data.', chunk);
				}

				for (const message of YieldMessages(chunk.data[0])) yield message;

				break;
			}
			case 'error':
				throw new StreamError('Error in LangGraph stream.', chunk);
		}
	}
}
