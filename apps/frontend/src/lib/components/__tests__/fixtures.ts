import type { AIMessage, UserMessage, ToolMessage } from '$lib/langgraph/types';
import type { ThreadSummary } from '$lib/langgraph/threadList';

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

export function aThread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
	return {
		id: 'thread-00000000-0000-0000-0000-000000000001',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		status: 'idle',
		metadata: {},
		title: null,
		...overrides
	};
}
