import { expect, test } from '@playwright/test';

test('click to place, replace, remove, persist', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('tray-line').click(); await page.getByTestId('slot-front_left').click();
  await expect(page.getByTestId('slot-front_left')).toHaveAttribute('data-sensor', 'line');
  await page.getByTestId('tray-color').click(); await page.getByTestId('slot-front_left').click();
  await expect(page.getByTestId('slot-front_left')).toHaveAttribute('data-sensor', 'color');
  await page.reload(); await expect(page.getByTestId('slot-front_left')).toHaveAttribute('data-sensor', 'color');
  await page.getByTestId('slot-remove-front_left').click();
  await expect(page.getByTestId('slot-front_left')).toHaveAttribute('data-sensor', '');
});
test('new project clears the robot', async ({ page }) => {
  page.on('dialog', d => d.accept()); await page.goto('/');
  await page.getByTestId('tray-line').click(); await page.getByTestId('slot-left').click();
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('slot-left')).toHaveAttribute('data-sensor', '');
});
test('drag to place', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('tray-distance').dragTo(page.getByTestId('slot-front_center'));
  await expect(page.getByTestId('slot-front_center')).toHaveAttribute('data-sensor', 'distance');
});
test('next goes to program', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('to-program').click(); await expect(page.getByTestId('screen-program')).toBeVisible();
});

test('select toggles; drag moves a sensor and drops it off the robot', async ({ page }) => {
  await page.goto('/'); const tray = page.getByTestId('tray-line');
  await tray.click(); await expect(tray).toHaveAttribute('aria-pressed', 'true');
  await tray.click(); await expect(tray).toHaveAttribute('aria-pressed', 'false');
  await tray.dragTo(page.getByTestId('slot-left'));
  await page.getByTestId('slot-left').dragTo(page.getByTestId('slot-right'));
  await expect(page.getByTestId('slot-left')).toHaveAttribute('data-sensor', '');
  await expect(page.getByTestId('slot-right')).toHaveAttribute('data-sensor', 'line');
  await page.getByTestId('slot-right').dragTo(page.getByTestId('tray-color'));
  await expect(page.getByTestId('slot-right')).toHaveAttribute('data-sensor', '');
  await expect(page.getByTestId('slot-row-right')).toContainText('пусто');
});
