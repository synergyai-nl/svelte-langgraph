import { test, expect } from './fixtures/test';

test.describe('Homepage hero', () => {
	test('renders headline and all three CTA buttons', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('heading', { level: 1 })).toContainText('Your agent works.');
		await expect(page.getByRole('link', { name: /open the chat/i }).first()).toBeVisible();
		await expect(page.getByRole('link', { name: /try live demo/i }).first()).toBeVisible();
		await expect(page.getByRole('link', { name: /view on github/i }).first()).toBeVisible();
	});

	test('primary CTA navigates to the chat app', async ({ page }) => {
		await page.goto('/');

		await page
			.getByRole('link', { name: /open the chat/i })
			.first()
			.click();

		await expect(page).toHaveURL(/\/chat/);
	});

	test('renders hero terminal and stack logos', async ({ page }) => {
		await page.goto('/');

		// Scoped to the terminal: "proto install" also appears in the getting-started copy below.
		await expect(page.getByTestId('hero-terminal-body').getByText('proto install')).toBeVisible();
		await expect(page.getByAltText('Svelte')).toBeVisible();
		await expect(page.getByAltText('LangGraph')).toBeVisible();
	});
});

test.describe('Homepage features section', () => {
	test('renders all four feature cards', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByText('Connect Python agents directly')).toBeVisible();
		await expect(page.getByText('Pass security review. Stay maintainable.')).toBeVisible();
		await expect(page.getByText('Customize every layer — no lock-in')).toBeVisible();
		await expect(page.getByText('Swap models without rewriting')).toBeVisible();
	});
});

test.describe('Homepage getting started section', () => {
	test('renders all three steps', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByText('Install toolchain')).toBeVisible();
		await expect(page.getByText('Configure & run')).toBeVisible();
		await expect(page.getByText('Deploy to your stack')).toBeVisible();
	});
});

test.describe('Homepage personas section', () => {
	test('renders all four persona cards', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByText('Python AI developers')).toBeVisible();
		await expect(page.getByText('Boutique AI agencies')).toBeVisible();
		await expect(page.getByText('SaaS platform teams')).toBeVisible();
		await expect(page.getByText('CX & support teams')).toBeVisible();
	});
});

test.describe('Homepage landscape comparison table', () => {
	test('keeps row label visible when scrolled horizontally on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto('/');

		const region = page.getByRole('region', { name: 'Tool comparison' });
		await region.scrollIntoViewIfNeeded();

		const scroller = region.getByTestId('landscape-table-scroll');
		await scroller.evaluate((el) => {
			el.scrollLeft = 280;
		});

		await expect(region.getByRole('rowheader', { name: 'Security review friendly' })).toBeVisible();
	});

	test('keeps column header visible when scrolled vertically on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto('/');

		const region = page.getByRole('region', { name: 'Tool comparison' });
		await region.scrollIntoViewIfNeeded();

		const scroller = region.getByTestId('landscape-table-scroll');
		// Assert the container genuinely scrolled: if it were tall enough to fit the
		// whole table, scrollTop would stay 0 and the sticky header would be untested.
		const scrollTop = await scroller.evaluate((el) => {
			el.scrollTop = 400;
			return el.scrollTop;
		});
		expect(scrollTop).toBeGreaterThan(0);

		await expect(region.getByRole('columnheader', { name: /Langflow/i })).toBeVisible();
	});
});

test.describe('Homepage roadmap section', () => {
	test('shows shipped items and in-progress badges', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByText('Core chat UI with streaming')).toBeVisible();
		await expect(page.getByText('OIDC authentication')).toBeVisible();
		await expect(page.getByText('Shipped').first()).toBeVisible();
		await expect(page.getByText('In progress').first()).toBeVisible();
		await expect(page.getByText('Conversation history')).toBeVisible();
	});
});

test.describe('Homepage footer', () => {
	test('renders MIT license text and GitHub link', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByText(/MIT License/)).toBeVisible();
		await expect(
			page
				.getByRole('link', { name: /github/i })
				.filter({ hasText: /github/i })
				.last()
		).toBeVisible();
	});
});
