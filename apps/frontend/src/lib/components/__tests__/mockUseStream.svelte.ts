/**
 * Reactive mock state for useStream, using Svelte 5 $state so that
 * components re-render when helpers mutate it in tests.
 */

// Loose function type for mock callbacks that don't care about their arguments
type AnyFn = (...args: unknown[]) => unknown;

export const mockStreamCallbacks: {
	submit: AnyFn;
	stop: () => void;
	getMessagesMetadata: AnyFn;
} = {
	submit: () => {},
	stop: () => {},
	getMessagesMetadata: () => undefined
};

let _messages = $state<Record<string, unknown>[]>([]);
let _isLoading = $state(false);
let _error = $state<unknown>(null);
let _values = $state<Record<string, unknown>>({});

export const mockStream = {
	get messages() {
		return _messages;
	},
	get isLoading() {
		return _isLoading;
	},
	get error() {
		return _error;
	},
	get values() {
		return _values;
	},
	get submit() {
		return mockStreamCallbacks.submit;
	},
	get stop() {
		return mockStreamCallbacks.stop;
	},
	get getMessagesMetadata() {
		return mockStreamCallbacks.getMessagesMetadata;
	}
};

export function setMessages(msgs: Record<string, unknown>[]) {
	_messages = [...msgs];
}

export function setIsLoading(val: boolean) {
	_isLoading = val;
}

export function setError(err: unknown) {
	_error = err;
}

export function setValues(vals: Record<string, unknown>) {
	_values = { ...vals };
}

export function resetMock() {
	_messages = [];
	_isLoading = false;
	_error = null;
	_values = {};
	mockStreamCallbacks.submit = () => {};
	mockStreamCallbacks.stop = () => {};
	mockStreamCallbacks.getMessagesMetadata = () => undefined;
}
