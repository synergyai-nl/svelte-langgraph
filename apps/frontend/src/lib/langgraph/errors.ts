import type { ErrorStreamEvent } from '@langchain/langgraph-sdk';

export class LangGraphError extends Error {
	constructor(message: string) {
		super(message);
		Object.setPrototypeOf(this, LangGraphError.prototype);
	}
}

export class InvalidData extends LangGraphError {
	obj: object;

	constructor(message: string, obj: object) {
		super(message);
		this.obj = obj;
		Object.setPrototypeOf(this, InvalidData.prototype);
	}
}

export class StreamError extends LangGraphError {
	err_event: ErrorStreamEvent;

	constructor(message: string, err_event: ErrorStreamEvent) {
		super(message);
		this.err_event = err_event;
		Object.setPrototypeOf(this, StreamError.prototype);
	}
}
