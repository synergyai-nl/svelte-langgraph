import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

function base64urlToBytes(b64url: string): Uint8Array {
	const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
	const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
	return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function verify(payload: string, sig: string, secret: string): Promise<boolean> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	);
	return crypto.subtle.verify(
		'HMAC',
		key,
		base64urlToBytes(sig),
		new TextEncoder().encode(payload)
	);
}

export const POST: RequestHandler = async ({ request, url, locals }) => {
	const session = await locals.auth();
	if (!session) error(401, 'Unauthorized');

	const token = url.searchParams.get('token');
	if (!token) error(400, 'token query param is required');

	const { score } = await request.json();
	if (!Number.isFinite(score) || (score !== 0 && score !== 1)) error(400, 'score must be 0 or 1');

	const secret = env.AUTH_SECRET;
	if (!secret) error(500, 'Server misconfigured');

	const parts = token.split('.');
	if (parts.length !== 2) error(400, 'Invalid token');
	const [payload, sig] = parts;

	const valid = await verify(payload, sig, secret);
	if (!valid) error(403, 'Invalid token signature');

	let parsed: { run_id: string; exp: number };
	try {
		parsed = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload)));
	} catch {
		error(400, 'Malformed token');
	}

	if (Date.now() > parsed.exp) error(403, 'Token expired');

	// Fail loudly rather than defaulting to localhost, matching createClient: a
	// silent fallback would send scores nowhere in a misconfigured deployment.
	const backendUrl = pubEnv.PUBLIC_LANGGRAPH_API_URL;
	if (!backendUrl) error(500, 'Server misconfigured');

	const response = await fetch(`${backendUrl}/feedback`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${session.accessToken}`
		},
		body: JSON.stringify({ run_id: parsed.run_id, score })
	});

	if (!response.ok) {
		console.error('Backend feedback call failed:', response.status);
		error(502, 'Failed to submit feedback');
	}

	return json({ ok: true });
};
