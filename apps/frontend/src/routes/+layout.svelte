<script lang="ts">
	import '../app.tailwind.css';

	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	import { LogOut, MessageSquare, Moon, Sun } from '@lucide/svelte';
	import { Navbar, NavBrand, NavLi, NavUl, NavHamburger } from 'flowbite-svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	import { ModeWatcher, toggleMode, mode } from 'mode-watcher';

	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';
	import SignOutButton from '$lib/auth/components/SignOutButton.svelte';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let { children } = $props();
</script>

<ModeWatcher />
<Navbar>
	<NavBrand href="/">
		<MessageSquare class="me-3 h-6 sm:h-9" />
		<span class="self-center text-xl font-semibold whitespace-nowrap dark:text-white">
			{m.app_title()}
		</span>
	</NavBrand>

	<div class="flex items-center md:order-2">
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
		<NavHamburger class="ml-3" />
	</div>

	<NavUl>
		<NavLi href="/">{m.nav_home()}</NavLi>
		<NavLi href="/chat">{m.nav_chat()}</NavLi>
	</NavUl>
</Navbar>

<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>
