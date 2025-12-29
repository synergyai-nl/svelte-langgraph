<script lang="ts">
	import '../app.tailwind.css';

	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	import { LogOut, MessageSquare, Moon, Sun } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';

	import { ModeWatcher, toggleMode, mode } from 'mode-watcher';

	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';
	import SignOutButton from '$lib/auth/components/SignOutButton.svelte';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { navigationMenuTriggerStyle } from '$lib/components/ui/navigation-menu/navigation-menu-trigger.svelte';

	let { children } = $props();

	function getInitials(name?: string | null): string {
		if (!name) return 'U';
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
</script>

<ModeWatcher />

<nav class="bg-background border-b">
	<div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
		<!-- Brand -->
		<a href="/" class="flex items-center space-x-3">
			<MessageSquare class="h-6 w-6 sm:h-9 sm:w-9" />
			<span class="text-xl font-semibold whitespace-nowrap">
				{m.app_title()}
			</span>
		</a>

		<!-- Navigation -->
		<NavigationMenu.Root>
			<NavigationMenu.List>
				<NavigationMenu.Item>
					<NavigationMenu.Link>
						{#snippet child()}
							<a href="/" class={navigationMenuTriggerStyle()}>
								{m.nav_home()}
							</a>
						{/snippet}
					</NavigationMenu.Link>
				</NavigationMenu.Item>

				<NavigationMenu.Item>
					<NavigationMenu.Link>
						{#snippet child()}
							<a href="/chat" class={navigationMenuTriggerStyle()}>
								{m.nav_chat()}
							</a>
						{/snippet}
					</NavigationMenu.Link>
				</NavigationMenu.Item>
			</NavigationMenu.List>
		</NavigationMenu.Root>

		<!-- Right Side Actions -->
		<div class="flex items-center space-x-3">
			{#if page.data.session}
				{@const session = page.data.session}
				<!-- Avatar Dropdown Menu -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger asChild>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" class="h-auto rounded-full px-3 py-2">
								<Avatar class="mr-2 h-8 w-8">
									<AvatarImage
										src={session.user?.image ?? undefined}
										alt={session.user?.name ?? 'User'}
									/>
									<AvatarFallback>{getInitials(session.user?.name)}</AvatarFallback>
								</Avatar>
								<span class="text-sm font-medium">
									{session.user?.name ?? m.user_fallback()}
								</span>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>

					<DropdownMenu.Content align="end" class="w-56">
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

						<DropdownMenu.Item onclick={toggleMode} class="justify-between">
							<div>{mode.current === 'light' ? m.light_mode() : m.dark_mode()}</div>
							<div class="flex items-center">
								{#if mode.current === 'light'}
									<Sun class="h-5 w-5" />
								{:else}
									<Moon class="h-5 w-5" />
								{/if}
							</div>
						</DropdownMenu.Item>

						<DropdownMenu.Separator />

						<SignOutButton>
							<DropdownMenu.Item class="justify-between">
								<div>{m.auth_sign_out()}</div>
								<div class="flex items-center">
									<LogOut class="h-5 w-5 shrink-0" />
								</div>
							</DropdownMenu.Item>
						</SignOutButton>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<SignInButton />
			{/if}

			<LanguageSwitcher />
		</div>
	</div>
</nav>

<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>
