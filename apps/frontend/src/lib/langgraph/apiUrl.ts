import { env } from '$env/dynamic/public';

/**
 * The backend's base URL, without a trailing slash.
 *
 * The LangGraph SDK strips one itself, so `createClient` tolerates either form.
 * Anything building a URL by hand has to strip it too, or a configured
 * "http://host:2026/" yields "//feedback" -- which Aegra answers with a 404
 * while every SDK call on the same value keeps working.
 *
 * Its own module, rather than living in client.ts: importing that from
 * `feedback.ts` would pull the SDK into every chunk that only wants this
 * string, which reorders module evaluation enough to break hydration.
 */
export function apiUrl(): string {
	const configured = env.PUBLIC_LANGGRAPH_API_URL;
	if (!configured) throw Error('Required PUBLIC_LANGGRAPH_API_URL is undefined');
	return configured.replace(/\/$/, '');
}
