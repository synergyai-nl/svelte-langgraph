import { test, expect } from './fixtures/test';

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
		await scroller.evaluate((el) => {
			el.scrollTop = 400;
		});

		await expect(region.getByRole('columnheader', { name: /Langflow/i })).toBeVisible();
	});
});
