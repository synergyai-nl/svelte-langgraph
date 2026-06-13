import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Pin the SvelteKit version to moon's task hash so client and server always agree on
// __sveltekit_<hash>. moon injects MOON_TASK_HASH and keeps it stable across retries and
// machines for identical inputs. Falls back to SvelteKit's Date.now() default when built
// outside moon (a standalone single-process build is internally consistent anyway).
const version = process.env.MOON_TASK_HASH ? { name: process.env.MOON_TASK_HASH } : undefined;

const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		...(version ? { version } : {}),
		alias: {
			async_hooks: './src/lib/async_hooks_mock.ts'
		}
	}
};

export default config;
