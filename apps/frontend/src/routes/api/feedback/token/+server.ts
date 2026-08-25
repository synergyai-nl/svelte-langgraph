import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// A rating is almost always given right after the answer arrives. An hour is
// generous for that while keeping a leaked token short-lived; the token only
// ever authorises scoring one run, so the blast radius is a single score.
const TOKEN_TTL_MS = 60 * 60 * 1000;

async function sign(payload: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
	return btoa(String.fromCharCode(...new Uint8Array(sig)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();
	if (!session) error(401, 'Unauthorized');

	const { run_id } = await request.json();
	if (!run_id || typeof run_id !== 'string') error(400, 'run_id is required');

	const secret = env.AUTH_SECRET;
	if (!secret) error(500, 'Server misconfigured');

	const payload = btoa(JSON.stringify({ run_id, exp: Date.now() + TOKEN_TTL_MS }))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

	const sig = await sign(payload, secret);
	const token = `${payload}.${sig}`;
	return json({ url: `/api/feedback?token=${token}` });
};
