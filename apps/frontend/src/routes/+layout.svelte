<script lang="ts">
	import '../app.tailwind.css';

	import { SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	import { LogOut, MessageSquare, Moon, Sun } from '@lucide/svelte';
	import { Navbar, NavBrand, NavLi, NavUl, NavHamburger, Avatar } from 'flowbite-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	import { ModeWatcher, toggleMode, mode } from 'mode-watcher';

	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';

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
			<!-- Avatar Dropdown Menu -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="default" class="rounded-full p-1 pr-4">
							<Avatar src={page.data.session.user?.image ?? undefined} size="sm" class="mr-2" />
							<span class="hidden text-sm font-medium sm:inline">
								{page.data.session.user?.name ?? m.user_fallback()}
							</span>
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>

				<DropdownMenu.Content align="end">
					<DropdownMenu.Label>
						<div class="flex flex-col space-y-1">
							<p class="text-sm leading-none font-medium">
								{page.data.session.user?.name ?? m.user_fallback()}
							</p>
							<p class="text-xs leading-none">
								{page.data.session.user?.email ?? m.email_fallback()}
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

					<SignOut
						options={{
							redirectTo: '/',
							redirect: true
						}}
					>
						<DropdownMenu.Item slot="submitButton" class="justify-between">
							<div>{m.auth_sign_out()}</div>
							<div class="flex items-center">
								<LogOut
									class="text-primary-500 dark:text-primary-600 pointer-events-none h-5 w-5 shrink-0"
								/>
							</div>
						</DropdownMenu.Item>
					</SignOut>
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
