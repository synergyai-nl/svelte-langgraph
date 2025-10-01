export interface BaseMessage {
	type: string;
	text: string;
	id: string;
}

export interface AIMessage extends BaseMessage {
	type: 'ai';
}

export interface UserMessage extends BaseMessage {
	type: 'user';
}

export interface ToolMessage extends BaseMessage {
	type: 'tool';
	tool_name: string;
	payload?: Record<string, unknown>;
	status?: 'success' | 'error';
}

export type Message = AIMessage | UserMessage | ToolMessage;
