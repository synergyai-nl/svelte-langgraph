import { InvalidData } from './errors';
import type { Message, UserMessage, AIMessage, ToolMessage } from './types';

export function convertThreadMessage(item: Record<string, unknown>): Message {
	if (item.type === 'human') {
		return {
			type: 'user',
			text: typeof item.content === 'string' ? item.content : '',
			id: (item.id as string) || ''
		} as UserMessage;
	} else if (item.type === 'ai') {
		return {
			type: 'ai',
			text: typeof item.content === 'string' ? item.content : '',
			id: (item.id as string) || ''
		} as AIMessage;
	} else if (item.type === 'tool') {
		return {
			type: 'tool',
			text: typeof item.content === 'string' ? item.content : '',
			tool_name: (item.name as string) || '',
			id: (item.tool_call_id as string) || (item.id as string) || '',
			status: (item.status as 'success' | 'error') || 'success'
		} as ToolMessage;
	}
	throw new InvalidData(`Unexpected message type: ${item.type}`, item);
}
