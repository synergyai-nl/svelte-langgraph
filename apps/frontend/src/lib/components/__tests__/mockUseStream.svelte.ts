/**
 * Reactive mock state for useStream, using Svelte 5 $state so that
 * components re-render when helpers mutate it in tests.
 */

export const mockStreamCallbacks = {
	submit: () => {},
	stop: () => {}
};

let _messages = $state<Record<string, unknown>[]>([]);
let _isLoading = $state(false);
let _error = $state<unknown>(null);

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
	get submit() {
		return mockStreamCallbacks.submit;
	},
	get stop() {
		return mockStreamCallbacks.stop;
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

export function resetMock() {
	_messages = [];
	_isLoading = false;
	_error = null;
	mockStreamCallbacks.submit = () => {};
	mockStreamCallbacks.stop = () => {};
}
