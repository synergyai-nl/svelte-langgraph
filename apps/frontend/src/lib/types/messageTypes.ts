export interface BaseMessage {
  type: 'ai' | 'user' | 'tool';
  text: string;
}

export interface ToolMessageType extends BaseMessage {
  type: 'tool';
  tool_name: string;
  payload?: unknown; // prefer unknown over any for safety
  collapsed?: boolean;
}

export type Message = BaseMessage | ToolMessageType;

export interface ChatSuggestion {
  title: string;
  description: string;
  suggestedText: string;
}
