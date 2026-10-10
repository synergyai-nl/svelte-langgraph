export interface BaseMessage {
	type: string;
	text: string;
	id: string;
}

export interface AIMessage extends BaseMessage {
	type: 'ai';
	thinking?: string;
	/** Carries the producing run the backend stamps on, so /feedback can
	 *  score its trace. Absent while streaming and on pre-stamp answers. */
	rateable?: boolean;
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

export interface ThreadValues {
	messages?: Record<string, unknown>[];
	[key: string]: unknown;
}
