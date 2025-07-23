export interface BaseMessage {
	type: 'ai' | 'user' | 'tool';
	text: string;
	id: string;
}

export interface ToolMessage {
	text: string;
	tool_name: string;
	payload?: Record<string, unknown>;
	collapsed?: boolean;
}

export interface ToolMessageType extends BaseMessage, ToolMessage {}

export type Message = BaseMessage | ToolMessageType;

export interface ChatSuggestion {
	title: string;
	description: string;
	suggestedText: string;
}
