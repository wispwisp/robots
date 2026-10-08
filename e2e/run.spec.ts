import { expect, test } from '@playwright/test';
import { readSolution, REFERENCE_ASSEMBLY } from '../tests/solutions/reference';
import { gotoProgram, setPython, setupReference } from './helpers';

for (const id of ['first_steps', 'barrier', 'colors'] as const)
  test(`demo flow completes ${id}`, async ({ page }) => {
    test.setTimeout(180_000);
    page.on('dialog', d => d.accept()); await page.goto('/'); await page.getByTestId('new-project').click();
    for (const [slot, type] of Object.entries(REFERENCE_ASSEMBLY)) { await page.getByTestId(`tray-${type}`).click(); await page.getByTestId(`slot-${slot}`).click(); }
    await page.getByTestId('to-program').click(); await page.getByTestId('track-select').selectOption(id);
    await setPython(page, readSolution(id)); await page.getByTestId('run').click();
    await expect(page.getByTestId('banner')).toContainText('Трасса пройдена!', { timeout: 150_000 });
  });
test('stop interrupts an infinite loop', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'while True:\n    pass\n'); await page.getByTestId('run').click();
  await page.waitForTimeout(500); await page.getByTestId('stop').click();
  await expect(page.getByTestId('run')).toBeEnabled({ timeout: 1000 });
});
// Ruling R20: no world time passes without commands or sensor reads, so the run says why the robot stands still.
test('a program that gives no commands gets a hint until it is stopped', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'from robot import *\n\nmotors(50, 50)\nwhile True:\n    pass\n');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('status')).toHaveText('Программа работает, но не даёт роботу команд — время на трассе стоит',
    { timeout: 3000 });
  await page.getByTestId('stop').click();
  await expect(page.getByTestId('status')).toBeHidden();
});
test('runtime error is translated and highlighted', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'from robot import *\n\nmotor(1, 2)\n'); await page.getByTestId('run').click();
  await expect(page.getByTestId('status')).toContainText('Имя «motor» не найдено');
});
test('run applies pending edit', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'from robot import *\n\nprint("old")\n');
  await page.waitForTimeout(700); await setPython(page, 'from robot import *\n\nprint("new")\n');
  await page.getByTestId('run').click(); await expect(page.getByTestId('readings')).toContainText('new');
});
test('language switch during run', async ({ page }) => {
  test.setTimeout(180_000); await setupReference(page, 'first_steps'); await page.getByTestId('run').click();
  await page.waitForTimeout(2000); await page.getByTestId('lang-kk').click();
  await expect(page.getByTestId('blocks-pane')).not.toHaveAttribute('data-highlight', '');
  await expect(page.getByTestId('banner')).toBeVisible({ timeout: 150_000 });
});
test('editors are read-only while running', async ({ page }) => {
  await setupReference(page, 'first_steps'); await page.getByTestId('run').click();
  await page.getByTestId('python-editor').click(); await page.keyboard.type('zzz');
  await expect(page.getByTestId('python-editor')).not.toContainText('zzz');
});
test('the line and block being run are scrolled into view', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1366, height: 657 });
  await setupReference(page, 'colors');
  await page.locator('.cm-scroller').evaluate(e => { e.scrollTop = 0; }); // the solution's last lines are run most
  await page.getByTestId('run').click();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1000);
    // Measured in one go, as the highlight moves on every frame.
    const seen = await page.evaluate(() => {
      const inside = (box: DOMRect, area: { top: number; bottom: number; left: number; right: number }) =>
        box.top >= area.top - 1 && box.top + Math.min(box.height, area.bottom - area.top) <= area.bottom + 1
        && box.left >= area.left - 1 && box.left < area.right;
      const line = document.querySelector('.cm-run-line')!.getBoundingClientRect();
      const scroller = document.querySelector('.cm-scroller')!.getBoundingClientRect();
      const pane = document.querySelector<HTMLElement>('[data-testid=blocks-pane]')!;
      const block = pane.querySelector(`[data-id="${pane.dataset.highlight}"] > .blocklyPath`)!.getBoundingClientRect();
      const host = pane.querySelector('.blocklySvg')!.getBoundingClientRect();
      const toolbox = pane.querySelector('.blocklyToolbox')!.getBoundingClientRect();
      return { line: inside(line, scroller), block: inside(block, { ...host.toJSON(), left: toolbox.right }) };
    });
    expect(seen, `sample ${i}`).toEqual({ line: true, block: true });
  }
});
test('the error line stays highlighted; a rerun of the fixed line highlights its new block', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'from robot import *\n\nwhile True:\n    motor(1, 2)\n');
  await page.getByTestId('run').click(); await expect(page.getByTestId('status')).toContainText('Строка 4');
  const highlighted = page.locator('[data-testid=blocks-pane] .blocklyHighlighted');
  await expect(page.locator('.cm-run-line')).toHaveText('    motor(1, 2)'); await expect(highlighted).toHaveCount(1);
  await setPython(page, 'from robot import *\n\nwhile True:\n    motors(1, 2)\n'); await page.getByTestId('run').click();
  await expect(page.locator('.cm-run-line')).toHaveText('    motors(1, 2)');
  await expect(highlighted).toHaveCount(1); await expect(highlighted).toContainText('моторы');
});
