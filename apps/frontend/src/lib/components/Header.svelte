<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';

	import { LogOut, MessageSquare, Moon, Sun, Menu } from '@lucide/svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';

	import { toggleMode, mode } from 'mode-watcher';

	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';
	import SignOutButton from '$lib/auth/components/SignOutButton.svelte';
</script>

<header class="bg-background/95 supports-[backdrop-filter]:bg-background/60 border-b backdrop-blur">
	<div class="flex h-16 items-center px-4">
		<!-- Logo -->
		<a href="/" class="flex items-center gap-2 font-semibold">
			<MessageSquare class="h-6 w-6" />
			<span class="text-sm font-semibold sm:text-lg">{m.app_title()}</span>
		</a>

		<!-- Centered Navigation Menu (Desktop only) -->
		<div class="hidden flex-1 justify-center md:flex">
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

		<!-- Mobile Menu Dropdown -->
		<div class="mr-3 ml-auto md:hidden">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon" aria-label="Toggle menu">
							<Menu class="h-6 w-6" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>

				<DropdownMenu.Content align="end" class="w-56">
					<DropdownMenu.Item onclick={() => goto('/')} class="cursor-pointer">
						{m.nav_home()}
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={() => goto('/chat')} class="cursor-pointer">
						{m.nav_chat()}
					</DropdownMenu.Item>

					<DropdownMenu.Separator />

					{#if page.data.session}
						{@const session = page.data.session}

						<DropdownMenu.Item onclick={toggleMode} class="cursor-pointer justify-between">
							<span>{mode.current === 'light' ? m.light_mode() : m.dark_mode()}</span>
							<div class="flex items-center">
								{#if mode.current === 'light'}
									<Sun class="text-primary-500 h-4 w-4" />
								{:else}
									<Moon class="text-primary-600 h-4 w-4" />
								{/if}
							</div>
						</DropdownMenu.Item>

						<DropdownMenu.Separator />

						<DropdownMenu.Label>
							<div class="flex flex-col space-y-1">
								<p class="text-sm leading-none font-medium">
									{session.user?.name ?? m.user_fallback()}
								</p>
								<p class="text-muted-foreground text-xs leading-none">
									{session.user?.email ?? m.email_fallback()}
								</p>
							</div>
						</DropdownMenu.Label>

						<DropdownMenu.Separator />

						<SignOutButton>
							<DropdownMenu.Item class="cursor-pointer justify-between">
								<span>{m.auth_sign_out()}</span>
								<LogOut class="text-primary-500 dark:text-primary-600 h-4 w-4" />
							</DropdownMenu.Item>
						</SignOutButton>
					{:else}
						<div class="p-2">
							<SignInButton />
						</div>
					{/if}

					<DropdownMenu.Separator />

					<div class="p-2">
						<LanguageSwitcher class="w-full" />
					</div>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>

		<!-- Avatar, Theme Switcher, Language Switcher (Desktop only) -->
		<div class="ml-auto hidden items-center gap-3 md:flex">
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
			<ThemeSwitcher />
			<LanguageSwitcher />
		</div>
	</div>
</header>
