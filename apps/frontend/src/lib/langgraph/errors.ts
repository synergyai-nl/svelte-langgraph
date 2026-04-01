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
