// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Auth } from '$lib/auth';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: Auth['$Infer']['Session']['session'] | null;
			user: Auth['$Infer']['Session']['user'] | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
