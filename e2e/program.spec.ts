import { expect, test } from '@playwright/test';
import { readSolution } from '../tests/solutions/reference';
import { dragFromToolboxIntoStart, gotoProgram, openVariablesCategoryAndClickCreate, setPython } from './helpers';

test('typing Python builds blocks', async ({ page }) => {
  await gotoProgram(page); await setPython(page, readSolution('first_steps'));
  await expect.poll(() => page.locator('[data-testid=blocks-pane] .blocklyDraggable').count()).toBeGreaterThan(5);
  await page.reload(); await expect(page.getByTestId('python-editor')).toContainText('motors(0, 50)');
});
test('syntax error shows translated message', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'from robot import *\n\nif x\n');
  await expect(page.getByTestId('python-error')).toContainText('Строка 3');
});
test('cyrillic variable', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'скорость = 5\n');
  await expect(page.getByTestId('python-error')).toContainText('латинские буквы');
  const seen: string[] = [];
  page.on('dialog', d => { seen.push(d.type() + ':' + d.message());
    if (seen.length === 1) d.accept('скорость'); else if (seen.length === 2) d.accept(); else d.dismiss(); });
  await openVariablesCategoryAndClickCreate(page);
  await expect.poll(() => seen.length).toBe(3);
  expect(seen[1]).toContain('латинские');
  await expect(page.locator('.blocklyFlyout')).not.toContainText('скорость');
});
test('blocks edit regenerates Python', async ({ page }) => {
  await gotoProgram(page); await dragFromToolboxIntoStart(page, 'Робот', 'стоп');
  await expect(page.getByTestId('python-editor')).toContainText('stop()');
});
test('built blocks leave the typed Python as it is; functions and calls survive', async ({ page }) => {
  const python = async () => (await page.locator('[data-testid=python-editor] .cm-line').allTextContents()).join('\n');
  const typed = 'from robot import *\ndef go():\n    motors(1,2)\ngo()\n';
  await gotoProgram(page); await setPython(page, typed);
  await expect.poll(() => page.locator('svg.blocklySvg .blocklyDraggable').count()).toBeGreaterThan(3);
  await page.waitForTimeout(500); // time for any stray Blockly event to regenerate the text
  expect(await python()).toBe(typed);
  await dragFromToolboxIntoStart(page, 'Робот', 'стоп');
  await expect.poll(python).toBe('from robot import *\n\ndef go():\n    motors(1, 2)\n\ngo()\nstop()\n');
});
test('language and theme switches keep the program; blocks re-labelled', async ({ page }) => {
  await gotoProgram(page); await setPython(page, readSolution('first_steps'));
  await page.getByTestId('theme-toggle').click(); await page.getByTestId('lang-kk').click();
  await expect(page.getByTestId('python-editor')).toContainText('motors(0, 50)');
  await expect(page.getByTestId('blocks-pane')).not.toContainText('повторять');
});
