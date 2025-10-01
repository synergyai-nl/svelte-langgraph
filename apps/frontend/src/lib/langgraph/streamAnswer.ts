import type { Client } from '@langchain/langgraph-sdk';
import type { MessageContentComplex } from '@langchain/core/messages';

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
				const content = message.content as MessageContentComplex[];

				if (content) {
					for (const fragment of content) {
						switch (fragment.type) {
							case 'text':
								yield { type: 'text', text: fragment.text, messageId };
								break;
							case 'tool_use':
								yield {
									type: 'tool',
									tool_name: fragment.name,
									tool_payload: fragment.input,
									messageId
								};
								break;
							case 'input_json_delta':
								break;
							default:
								console.log('Unexpected fragment type:', fragment.type);
						}
					}
				}

				break;
			}
			case 'error':
				console.error('Error:', chunk.data);
				break;
		}
	}
}
