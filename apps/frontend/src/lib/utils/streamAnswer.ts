import { Client } from '@langchain/langgraph-sdk';

export async function* streamAnswer(
	client: Client,
	threadId: string,
	assistantId: string,
	input: string | undefined,
	messageId?: string
) {
	const input_messages = [];

	if (input_messages.length === 0)
		input_messages.push({ role: 'ai', content: 'How may I help you?' });
	console.debug(input_messages);
	input_messages.push({ role: 'user', content: input, ...(messageId ? { id: messageId } : {}) });

	const streamResponse = client.runs.stream(threadId, assistantId, {
		input: {
			messages: input_messages
		},
		streamMode: 'messages-tuple'
	});

	for await (const chunk of streamResponse) {
		console.debug('Got chunk:', chunk);

		switch (chunk.event) {
			case 'messages': {
				if (!chunk.data || !chunk.data[0]) {
					console.error('Invalid chunk data:', chunk);
					continue;
				}

				const message = chunk.data[0];
				const messageId = message.id;

				switch (message.type) {
					// @ts-expect-error bug in LangGraph here - we're getting different values here from what's expected.
					case 'AIMessageChunk':
						// @ts-expect-error LangGraph
						yield { type: 'text', text: message.content, messageId };
						break;
					case 'tool':
						yield {
							type: 'tool',
							tool_name: message.name,
							tool_payload: message.content,
							messageId
						};
						break;
					default:
						console.log('Unexpected message:', message);
				}

				break;
			}
			case 'error':
				console.error('Error:', chunk.data);
				break;
		}
	}
}
