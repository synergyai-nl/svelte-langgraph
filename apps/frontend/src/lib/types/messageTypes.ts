export interface BaseMessage {
	type: 'ai' | 'user' | 'tool';
	text: string;
}

export interface ToolMessage {
	text: string;
	tool_name: string;
	payload?: Record<string, unknown>; //Update this to a proper type
	collapsed?: boolean;
}

export interface ToolMessageType extends BaseMessage, ToolMessage {}

export type Message = BaseMessage | ToolMessageType;

export interface ChatSuggestion {
	title: string;
	description: string;
	suggestedText: string;
}
