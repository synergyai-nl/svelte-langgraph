import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

async function verify(payload: string, sig: string, secret: string): Promise<boolean> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	);
	const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
		c.charCodeAt(0)
	);
	return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload));
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();
	if (!session) error(401, 'Unauthorized');

	const { token, score } = await request.json();
	if (!token || typeof score !== 'number') error(400, 'token and score are required');

	const secret = env.AUTH_SECRET;
	if (!secret) error(500, 'Server misconfigured');

	const parts = token.split('.');
	if (parts.length !== 2) error(400, 'Invalid token');
	const [payload, sig] = parts;

	const valid = await verify(payload, sig, secret);
	if (!valid) error(403, 'Invalid token signature');

	let parsed: { run_id: string; exp: number };
	try {
		parsed = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
	} catch {
		error(400, 'Malformed token');
	}

	if (Date.now() > parsed.exp) error(403, 'Token expired');

	const langfuseSecretKey = env.LANGFUSE_SECRET_KEY;
	const langfusePublicKey = env.LANGFUSE_PUBLIC_KEY;
	const langfuseHost = env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com';

	if (!langfuseSecretKey || !langfusePublicKey) error(503, 'Feedback service not configured');

	const credentials = btoa(`${langfusePublicKey}:${langfuseSecretKey}`);

	const response = await fetch(`${langfuseHost}/api/public/scores`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${credentials}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			traceId: parsed.run_id,
			name: 'user_feedback',
			value: score
		})
	});

	if (!response.ok) {
		const text = await response.text();
		console.error('Langfuse score submission failed:', response.status, text);
		error(502, 'Failed to submit feedback');
	}

	return json({ ok: true });
};
