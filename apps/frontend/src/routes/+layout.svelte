<script lang="ts">
	import '../app.tailwind.css';

	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	import { LogOut, MessageSquare, Moon, Sun, Menu, X } from '@lucide/svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';

	import { ModeWatcher, toggleMode, mode } from 'mode-watcher';

	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';
	import SignOutButton from '$lib/auth/components/SignOutButton.svelte';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let { children } = $props();
	let mobileMenuOpen = $state(false);
</script>

<ModeWatcher />
<header class="bg-background/95 supports-[backdrop-filter]:bg-background/60 border-b backdrop-blur">
	<div class="flex h-16 items-center px-4">
		<!-- Logo -->
		<a href="/" class="flex items-center gap-2 font-semibold">
			<MessageSquare class="h-6 w-6" />
			<span class="text-sm sm:text-lg font-semibold">{m.app_title()}</span>
		</a>

		<!-- Centered Navigation Menu (Desktop only) -->
		<div class="hidden md:flex flex-1 justify-center">
			<NavigationMenu.Root>
				<NavigationMenu.List>
					<NavigationMenu.Item>
						<NavigationMenu.Link
							href="/"
							class="hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors"
						>
							{m.nav_home()}
						</NavigationMenu.Link>
					</NavigationMenu.Item>
					<NavigationMenu.Item>
						<NavigationMenu.Link
							href="/chat"
							class="hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors"
						>
							{m.nav_chat()}
						</NavigationMenu.Link>
					</NavigationMenu.Item>
				</NavigationMenu.List>
			</NavigationMenu.Root>
		</div>

		<!-- Mobile Menu Button -->
		<button
			onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
			class="md:hidden ml-auto mr-3 p-2 hover:bg-accent rounded-md transition-colors"
			aria-label="Toggle menu"
		>
			{#if mobileMenuOpen}
				<X class="h-6 w-6" />
			{:else}
				<Menu class="h-6 w-6" />
			{/if}
		</button>

		<!-- Right side: Avatar, Language Switcher (Desktop only) -->
		<div class="hidden md:flex items-center gap-3 ml-auto">
			{#if page.data.session}
				{@const session = page.data.session}
				<!-- Avatar Dropdown Menu -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="default" class="flex justify-center gap-2 rounded-full">
								<Avatar.Root class="h-4 w-4">
									<Avatar.Image
										src={session.user?.image ?? undefined}
										alt={session.user?.name ?? m.user_fallback()}
									/>
									<Avatar.Fallback class="prose dark:prose-invert text-[10px]"
										>{session.user?.name?.substring(0, 2).toUpperCase() ?? 'U'}</Avatar.Fallback
									>
								</Avatar.Root>
								<span class="hidden text-sm font-medium sm:inline">
									{session.user?.name ?? m.user_fallback()}
								</span>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>

					<DropdownMenu.Content align="end">
						<DropdownMenu.Label>
							<div class="flex flex-col space-y-1">
								<p class="text-sm leading-none font-medium">
									{session.user?.name ?? m.user_fallback()}
								</p>
								<p class="text-xs leading-none">
									{session.user?.email ?? m.email_fallback()}
								</p>
							</div>
						</DropdownMenu.Label>

						<DropdownMenu.Separator />

						<DropdownMenu.Item onclick={toggleMode} class="justify-between">
							<div>{mode.current === 'light' ? m.light_mode() : m.dark_mode()}</div>
							<div class="flex items-center">
								{#if mode.current === 'light'}
									<Sun class="text-primary-500 h-5 w-5" />
								{:else}
									<Moon class="text-primary-600 h-5 w-5" />
								{/if}
							</div>
						</DropdownMenu.Item>

						<DropdownMenu.Separator />

						<SignOutButton>
							<DropdownMenu.Item class="justify-between">
								<div>{m.auth_sign_out()}</div>
								<div class="flex items-center">
									<LogOut
										class="text-primary-500 dark:text-primary-600 pointer-events-none h-5 w-5 shrink-0"
									/>
								</div>
							</DropdownMenu.Item>
						</SignOutButton>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<SignInButton />
			{/if}
			<LanguageSwitcher class="ml-3" />
		</div>
	</div>
</header>

<!-- Mobile Menu Overlay -->
{#if mobileMenuOpen}
	<div
		class="md:hidden fixed inset-0 top-16 z-50 bg-background border-b overflow-y-auto"
		onclick={() => (mobileMenuOpen = false)}
	>
		<nav class="flex flex-col px-4 py-4 gap-2" onclick={(e) => e.stopPropagation()}>
			<!-- Navigation Links -->
			<a
				href="/"
				onclick={() => (mobileMenuOpen = false)}
				class="px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
			>
				{m.nav_home()}
			</a>
			<a
				href="/chat"
				onclick={() => (mobileMenuOpen = false)}
				class="px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
			>
				{m.nav_chat()}
			</a>

			<div class="border-t mt-3 pt-3 flex flex-col gap-2">
				{#if page.data.session}
					{@const session = page.data.session}
					<button
						onclick={toggleMode}
						class="flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
					>
						<span>{mode.current === 'light' ? m.light_mode() : m.dark_mode()}</span>
						<div class="flex items-center">
							{#if mode.current === 'light'}
								<Sun class="text-primary-500 h-5 w-5" />
							{:else}
								<Moon class="text-primary-600 h-5 w-5" />
							{/if}
						</div>
					</button>

					<div class="px-3 py-2 border-t text-xs">
						<p class="font-medium">{session.user?.name ?? m.user_fallback()}</p>
						<p class="text-muted-foreground">{session.user?.email ?? m.email_fallback()}</p>
					</div>

					<SignOutButton>
						<button class="flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground rounded-md transition-colors w-full text-left">
							<span>{m.auth_sign_out()}</span>
							<LogOut class="text-primary-500 dark:text-primary-600 h-5 w-5" />
						</button>
					</SignOutButton>
				{:else}
					<SignInButton class="w-full" />
				{/if}

				<LanguageSwitcher class="w-full" />
			</div>
		</nav>
	</div>
{/if}

<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>
