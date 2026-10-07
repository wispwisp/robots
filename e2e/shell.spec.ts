import { expect, test } from '@playwright/test';

test('language switch and persistence', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('lang-kk').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
});
test('theme toggle persists', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' }); await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('theme-toggle').click(); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
test('small window message', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 }); await page.goto('/');
  await expect(page.getByTestId('small-screen')).toBeVisible();
});
