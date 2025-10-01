import type { AIMessage, ToolMessage } from '@langchain/langgraph-sdk';

export interface FixedAIMessage extends Omit<AIMessage, 'type'> {
	type: 'AIMessageChunk';
}

export type FixedMessage = FixedAIMessage | ToolMessage;
