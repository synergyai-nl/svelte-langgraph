/** Whether an error is a run being cancelled rather than a run failing.
 *
 *  Also matched as a substring: the Python server stores a cancellation as raw
 *  text in thread task history, so it may arrive as a string, not an Error. */
export function isCancellationError(err: unknown): boolean {
	if (err instanceof Error) {
		return err.name === 'CancelledError' || err.name === 'AbortError';
	}
	const str = String(err);
	return str.includes('CancelledError') || str.includes('AbortError');
}

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
