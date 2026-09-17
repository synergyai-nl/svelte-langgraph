import type { Auth } from '$lib/auth';

declare global {
	namespace App {
		interface Locals {
			session: Auth['$Infer']['Session']['session'] | null;
			user: Auth['$Infer']['Session']['user'] | null;
		}
	}
}
export {};
