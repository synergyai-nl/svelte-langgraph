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
	// Trimmed and stripped *before* the emptiness check, not after: "/" and "//"
	// are truthy but strip to "", which no caller can use. All trailing slashes
	// rather than one, since "host//" would otherwise still leave one.
	const configured = env.PUBLIC_LANGGRAPH_API_URL?.trim().replace(/\/+$/, '');
	if (!configured) throw Error('Required PUBLIC_LANGGRAPH_API_URL is undefined');

	// Absolute, because the callers disagree about what a relative value means:
	// the SDK falls back to its own default while a bare fetch() resolves
	// same-origin, so one bad value would send requests to two places silently.
	let parsed: URL;
	try {
		parsed = new URL(configured);
	} catch {
		throw Error(`PUBLIC_LANGGRAPH_API_URL must be absolute, got "${configured}"`);
	}
	// Every caller appends "/something", which would land after these.
	if (parsed.search || parsed.hash)
		throw Error('PUBLIC_LANGGRAPH_API_URL must not carry a query or fragment');

	return configured;
}
