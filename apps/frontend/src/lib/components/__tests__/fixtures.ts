import type { AIMessage, UserMessage, ToolMessage } from '$lib/langgraph/types';

export function anAIMessage(overrides: Partial<AIMessage> = {}): AIMessage {
	return { type: 'ai', text: 'Hello from AI', id: 'ai-1', ...overrides };
}

export function aUserMessage(overrides: Partial<UserMessage> = {}): UserMessage {
	return { type: 'user', text: 'Hello from user', id: 'user-1', ...overrides };
}

export function aToolMessage(overrides: Partial<ToolMessage> = {}): ToolMessage {
	return {
		type: 'tool',
		text: 'Tool result',
		id: 'tool-1',
		tool_name: 'search',
		status: 'success',
		...overrides
	};
}
