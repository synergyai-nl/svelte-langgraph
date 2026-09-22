import { describe, test, expect, vi, beforeEach } from 'vitest';
import { apiUrl } from './apiUrl';

// Hoisted because vi.mock is lifted above ordinary declarations.
const { env } = vi.hoisted(() => ({ env: {} as { PUBLIC_LANGGRAPH_API_URL?: string } }));
vi.mock('$env/dynamic/public', () => ({ env }));

beforeEach(() => {
	env.PUBLIC_LANGGRAPH_API_URL = 'https://backend.test';
});

describe('apiUrl', () => {
	test.each([
		['no trailing slash', 'https://backend.test', 'https://backend.test'],
		['one trailing slash', 'https://backend.test/', 'https://backend.test'],
		// Every consumer appends "/something", so a second slash would survive a
		// single-slash strip and produce "//titles".
		['several trailing slashes', 'https://backend.test///', 'https://backend.test'],
		['surrounding whitespace', '  https://backend.test/  ', 'https://backend.test'],
		// The path is part of the base and must survive.
		['a base path', 'https://backend.test/api/', 'https://backend.test/api'],
		['a port', 'http://localhost:2026/', 'http://localhost:2026']
	])('normalises %s', (_label, configured, expected) => {
		env.PUBLIC_LANGGRAPH_API_URL = configured;
		expect(apiUrl()).toBe(expected);
	});

	test.each([
		['unset', undefined],
		['empty', ''],
		// Whitespace-only is a misconfiguration, not a base URL: untrimmed it
		// would pass the check and silently prefix every request with spaces.
		['whitespace only', '   '],
		// Truthy, but strips to "" — which the SDK reads as "use your default
		// host" and a bare fetch reads as "same origin". Two destinations from
		// one value is worse than failing.
		['a lone slash', '/'],
		['only slashes', '//'],
		// Relative: same divergence, less obviously wrong.
		['no scheme', 'backend.test'],
		['an absolute path', '/api'],
		// Callers append "/something", which would land after these.
		['a query', 'https://backend.test/?x=1'],
		['a fragment', 'https://backend.test/#top']
	])('refuses %s', (_label, configured) => {
		env.PUBLIC_LANGGRAPH_API_URL = configured;
		expect(() => apiUrl()).toThrow(/PUBLIC_LANGGRAPH_API_URL/);
	});
});
