// Mock implementation of async_hooks for client-side usage
export class AsyncLocalStorage<T = unknown> {
	private store: T | undefined;

	getStore(): T | undefined {
		return this.store;
	}

	run<R>(store: T, callback: () => R): R {
		this.store = store;
		try {
			return callback();
		} finally {
			this.store = undefined;
		}
	}
}
