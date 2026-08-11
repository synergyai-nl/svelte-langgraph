<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';

	import { LogOut, MessageSquare, Moon, Sun, Menu, Github } from '@lucide/svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';

	import { toggleMode, mode } from 'mode-watcher';

	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';
	import SignOutButton from '$lib/auth/components/SignOutButton.svelte';
	import SentryFeedbackButton from './SentryFeedbackButton.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		variant?: 'app' | 'marketing';
	}

	let { variant = 'app' }: Props = $props();

	const isMarketing = $derived(variant === 'marketing');

	const GITHUB_URL = 'https://github.com/synergyai-nl/svelte-langgraph';
	const DEMO_URL = 'https://svelte-langgraph-demo.synergyai.nl/';
	const DOCS_URL = `${GITHUB_URL}#readme`;

	const marketingNavLinkClass =
		'text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors';
</script>

<header
	class={cn(
		isMarketing
			? 'bg-transparent'
			: 'bg-background/95 supports-[backdrop-filter]:bg-background/60 border-b backdrop-blur'
	)}
>
	<div class={cn('flex h-16 items-center', isMarketing ? 'mx-auto w-full max-w-7xl px-6' : 'px-4')}>
		<!-- Logo -->
		<a
			href="/"
			class={cn(
				'font-semibold',
				isMarketing
					? 'flex items-center gap-2.5'
					: 'flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2'
			)}
		>
			{#if isMarketing}
				<img src="/logos/svelte.svg" alt="" class="h-7 w-7 shrink-0" aria-hidden="true" />
				<span class="text-lg">{m.app_title()}</span>
			{:else}
				<span class="flex items-center gap-2">
					<MessageSquare class="h-6 w-6" />
					<span class="text-sm font-semibold sm:text-lg">{m.app_title()}</span>
				</span>
				<span class="text-muted-foreground hidden text-xs sm:inline">{m.app_tagline()}</span>
			{/if}
		</a>

		<!-- Desktop navigation -->
		{#if isMarketing}
			<nav class="hidden flex-1 items-center justify-center gap-1 md:flex" aria-label="Marketing">
				<a href="/chat" class={marketingNavLinkClass}>
					{m.nav_chat()}
				</a>
				<a href={DEMO_URL} target="_blank" rel="noopener noreferrer" class={marketingNavLinkClass}>
					Live demo
				</a>
				<a
					href={GITHUB_URL}
					target="_blank"
					rel="noopener noreferrer"
					class={marketingNavLinkClass}
				>
					GitHub
				</a>
				<a href={DOCS_URL} target="_blank" rel="noopener noreferrer" class={marketingNavLinkClass}>
					{m.nav_docs()}
				</a>
			</nav>
		{:else}
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
						<NavigationMenu.Item>
							<NavigationMenu.Link
								href={DOCS_URL}
								target="_blank"
								rel="noopener noreferrer"
								class="hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors"
							>
								{m.nav_docs()}
							</NavigationMenu.Link>
						</NavigationMenu.Item>
					</NavigationMenu.List>
				</NavigationMenu.Root>
			</div>
		{/if}

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
					{#if isMarketing}
						<DropdownMenu.Item onclick={() => goto('/chat')} class="cursor-pointer">
							{m.nav_chat()}
						</DropdownMenu.Item>
						<DropdownMenu.Item>
							<a href={DEMO_URL} target="_blank" rel="noopener noreferrer" class="block w-full">
								Live demo
							</a>
						</DropdownMenu.Item>
						<DropdownMenu.Item>
							<a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" class="block w-full">
								<Github class="mr-2 inline size-4" />
								GitHub
							</a>
						</DropdownMenu.Item>
						<DropdownMenu.Item>
							<a href={DOCS_URL} target="_blank" rel="noopener noreferrer" class="block w-full">
								{m.nav_docs()}
							</a>
						</DropdownMenu.Item>
					{:else}
						<DropdownMenu.Item onclick={() => goto('/')} class="cursor-pointer">
							{m.nav_home()}
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => goto('/chat')} class="cursor-pointer">
							{m.nav_chat()}
						</DropdownMenu.Item>
						<DropdownMenu.Item>
							<a href={DOCS_URL} target="_blank" rel="noopener noreferrer" class="block w-full">
								{m.nav_docs()}
							</a>
						</DropdownMenu.Item>
					{/if}

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
							<SignInButton variant={isMarketing ? 'outline' : 'default'} />
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
				<SignInButton variant={isMarketing ? 'outline' : 'default'} />
			{/if}
			{#if !isMarketing}
				<SentryFeedbackButton />
			{/if}
			<ThemeSwitcher />
			<LanguageSwitcher />
		</div>
	</div>
</header>
