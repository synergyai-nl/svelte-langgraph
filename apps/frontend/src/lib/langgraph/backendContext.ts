import { getContext, setContext } from 'svelte';
import type { Client } from '@langchain/langgraph-sdk';

interface BackendContext {
	readonly client: Client | null;
	fetch: typeof globalThis.fetch;
}
const KEY = Symbol('backend');
export const setBackend = (backend: BackendContext) => setContext(KEY, backend);
export const getBackend = () => getContext<BackendContext>(KEY);
