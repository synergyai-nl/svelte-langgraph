import type { Page } from '@playwright/test';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { LANGGRAPH_CONFIG } from './backend';

/** One event of the agent server's thread stream: its channel and its payload. */
export interface FakeEvent {
	method: string;
	data: unknown;
}

/** The human message the page sent, as `run.start` carried it. */
export interface SentMessage {
	id: string;
	content: string;
}

/** What a fake run streams: `first` at once, then after `holdMs` the rest. */
export interface FakeRunScript {
	first: FakeEvent[];
	rest?: FakeEvent[];
	holdMs?: number;
}

/**
 * Serves the page's runs in place of the agent server, for replies the demo backend cannot
 * give (reasoning, a failure after the run started). The stream starts a run with
 * `POST /threads/{id}/commands` and follows it on `POST /threads/{id}/stream/events`, a
 * server-sent event stream that stays open between runs; both are routed here. A local HTTP
 * server rather than `route.fulfill`, which can only answer with a complete body.
 *
 * `script` gets the sent message and returns the run's events, without its `running`
 * lifecycle, which comes first. Every other request still reaches the real backend.
 */
export async function fakeRuns(
	page: Page,
	script: (sent: SentMessage) => FakeRunScript
): Promise<{ close: () => Promise<void> }> {
	const tape: Array<{ method: string; frame: string }> = [];
	const streams = new Set<{ channels: string[]; res: http.ServerResponse }>();
	const timers = new Set<ReturnType<typeof setTimeout>>();

	const emit = (events: FakeEvent[]) => {
		for (const { method, data } of events) {
			const seq = tape.length + 1;
			const envelope = {
				type: 'event',
				seq,
				event_id: `fake:${seq}`,
				method,
				params: { namespace: [], timestamp: Date.now(), data }
			};
			const entry = {
				method,
				frame: `event: ${method}\nid: ${seq}\ndata: ${JSON.stringify(envelope)}\n\n`
			};
			tape.push(entry);
			for (const stream of streams)
				if (stream.channels.includes(method)) stream.res.write(entry.frame);
		}
	};

	const server = http.createServer(async (req, res) => {
		// The browser enforces CORS against this server: echo the headers the preflight asks for.
		const cors = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers':
				req.headers['access-control-request-headers'] ?? 'authorization, content-type'
		};
		if (req.method === 'OPTIONS') {
			res.writeHead(204, cors).end();
			return;
		}
		let body = '';
		for await (const chunk of req) body += chunk;
		const request = JSON.parse(body || '{}');

		if (req.url?.endsWith('/commands')) {
			const sent = request.params?.input?.messages?.[0] ?? {};
			res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ type: 'success', id: request.id, result: { run_id: 'fake-run' } }));
			const { first, rest = [], holdMs = 0 } = script({ id: sent.id, content: sent.content });
			emit([{ method: 'lifecycle', data: { event: 'running' } }, ...first]);
			const timer = setTimeout(() => {
				timers.delete(timer);
				emit(rest);
			}, holdMs);
			timers.add(timer);
			return;
		}

		res.writeHead(200, {
			...cors,
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache'
		});
		const stream = { channels: request.channels ?? [], res };
		for (const entry of tape) if (stream.channels.includes(entry.method)) res.write(entry.frame);
		streams.add(stream);
		req.on('close', () => streams.delete(stream));
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});
	const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/commands`, (route) =>
		route.continue({ url: `${url}/commands` })
	);
	await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/stream/events`, (route) =>
		route.continue({ url: `${url}/stream/events` })
	);

	return {
		close: () =>
			new Promise<void>((resolve) => {
				for (const timer of timers) clearTimeout(timer);
				if (!server.listening) return resolve();
				server.close(() => resolve());
				server.closeAllConnections();
			})
	};
}

/** The `messages` events that stream an AI message `id` block by block, then finish it. */
export function streamedAiMessage(id: string, blocks: Array<{ type: string; parts: string[] }>) {
	const field = (type: string) => (type === 'reasoning' ? 'reasoning' : 'text');
	return [
		{ method: 'messages', data: { event: 'message-start', id, role: 'ai' } },
		...blocks.flatMap(({ type, parts }, index) => [
			{
				method: 'messages',
				data: { event: 'content-block-start', index, content: { type, [field(type)]: '' } }
			},
			...parts.map((part) => ({
				method: 'messages',
				data: { event: 'content-block-delta', index, content: { type, [field(type)]: part } }
			})),
			{
				method: 'messages',
				data: {
					event: 'content-block-finish',
					index,
					content: { type, [field(type)]: parts.join('') }
				}
			}
		]),
		{ method: 'messages', data: { event: 'message-finish', reason: 'stop' } }
	];
}
