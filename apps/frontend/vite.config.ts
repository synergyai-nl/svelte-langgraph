import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Pin the SvelteKit version to moon's task hash so client and server always agree on
// __sveltekit_<hash>. moon injects MOON_TASK_HASH and keeps it stable across retries and
// machines for identical inputs. Falls back to SvelteKit's Date.now() default when built
// outside moon (a standalone single-process build is internally consistent anyway).
const version = process.env.MOON_TASK_HASH ? { name: process.env.MOON_TASK_HASH } : undefined;

export default defineConfig(({ command, isPreview }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			...(version ? { version } : {})
		}),

		...(command === 'serve' && !isPreview && !process.env.VITEST
			? [
					paraglideVitePlugin({
						project: './project.inlang',
						outdir: './src/lib/paraglide',
						cleanOutdir: false,
						outputStructure: 'message-modules'
					})
				]
			: []),
		sentrySvelteKit({ telemetry: !process.env.VITEST })
	],
	test: {
		projects: [
			{
				test: {
					name: 'client',
					environment: 'jsdom',
					setupFiles: ['./vitest-setup-client.ts'],
					clearMocks: true,
					include: ['src/**/*.svelte.{spec,test}.{js,ts}'],
					exclude: [
						'src/lib/server/**',
						'e2e/**',
						'**/*.e2e.{spec,test}.{js,ts}',
						'src/**/*.server.{spec,test}.{js,ts}'
					]
				},
				plugins: [tailwindcss(), sveltekit(), svelteTesting()]
			},
			{
				test: {
					name: 'server',
					environment: 'node',
					clearMocks: true,
					include: ['src/**/*.{spec,test}.{js,ts}'],
					exclude: ['src/**/*.svelte.{spec,test}.{js,ts}', 'e2e/**', '**/*.e2e.{spec,test}.{js,ts}']
				},
				plugins: [tailwindcss(), sveltekit()]
			}
		]
	},
	optimizeDeps: {
		exclude: ['@svelte-langgraph/client']
	},
	ssr: {
		noExternal: ['@svelte-langgraph/client']
	},
	resolve: {
		alias: {
			async_hooks: fileURLToPath(new URL('./src/lib/async_hooks_mock.ts', import.meta.url))
		},
		dedupe: ['svelte']
	}
}));
