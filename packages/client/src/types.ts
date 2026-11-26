export type FeedbackScore = 'up' | 'down';

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
	/** The tools this message calls, when it calls any; a call is listed once it has an id and a
	 *  name. A call's result is the `ToolMessage` whose `id` is the call's `id`, when the server
	 *  sends one. Ids and names only: arguments are partial while a call streams, and are on the
	 *  matching tool message's `payload` once the result arrives. */
	toolCalls?: { id: string; name: string }[];
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
