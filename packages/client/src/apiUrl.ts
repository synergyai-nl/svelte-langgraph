/**
 * The configured backend base, with exactly one trailing slash so relative
 * routes resolve beneath it rather than replacing its last path segment.
 */
function baseUrl(configured: string | null | undefined): URL {
	const trimmed = configured?.trim();
	if (!trimmed) throw Error('Required LangGraph API URL is undefined');

	// Absolute only: the SDK and a bare fetch() resolve a relative value differently.
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw Error(`LangGraph API URL must be absolute, got "${trimmed}"`);
	}
	if (url.search || url.hash) throw Error('LangGraph API URL must not carry a query or fragment');

	url.pathname = url.pathname.replace(/\/*$/, '/');
	return url;
}

/** The validated backend base URL, for the SDK client. */
export function normalizeApiUrl(configured: string | null | undefined): string {
	return baseUrl(configured).href;
}

/** A custom backend route under `base`, e.g. `apiEndpoint(url, 'feedback')`. */
export function apiEndpoint(base: string, route: string): string {
	// A leading slash would resolve from the origin and drop any base path.
	if (route.startsWith('/')) throw Error(`Route must be relative, got "${route}"`);
	return new URL(route, baseUrl(base)).href;
}
