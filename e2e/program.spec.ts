import { expect, test, type Page } from '@playwright/test';
import { readSolution } from '../tests/solutions/reference';
import { dragFromToolboxIntoStart, getPython, gotoProgram, openVariablesCategoryAndClickCreate, setPython } from './helpers';

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
  // The blocks are locked while the Python has an error (Ruling R18b), so the error is fixed first.
  await setPython(page, 'from robot import *\n'); await expect(page.getByTestId('python-error')).toBeHidden();
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
  const typed = 'from robot import *\ndef go():\n    motors(1,2)\ngo()\n';
  await gotoProgram(page); await setPython(page, typed);
  await expect.poll(() => page.locator('svg.blocklySvg .blocklyDraggable').count()).toBeGreaterThan(3);
  await page.waitForTimeout(500); // time for any stray Blockly event to regenerate the text
  expect(await getPython(page)).toBe(typed);
  await dragFromToolboxIntoStart(page, 'Робот', 'стоп');
  await expect.poll(() => getPython(page)).toBe('from robot import *\n\ndef go():\n    motors(1, 2)\n\ngo()\nstop()\n');
});

// Ruling R18b: Python that is ahead of the blocks (an error, or an edit waiting for the typing pause) is never
// overwritten from the blocks; the blocks are locked meanwhile.
const startBlock = (page: Page) =>
  page.locator('svg.blocklySvg .blocklyBlockCanvas > .blocklyDraggable').filter({ hasText: 'при запуске' });
async function dragStartBlock(page: Page): Promise<void> {
  const box = (await startBlock(page).boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 70, { steps: 2 }); await page.mouse.up();
}
test('a Python error locks the blocks until it is fixed', async ({ page }) => {
  const broken = 'from robot import *\n\nwhile True\n    stop()\n    stop()\n';
  await gotoProgram(page); await setPython(page, broken);
  await expect(page.getByTestId('python-error')).toContainText('Строка 3');
  const lock = page.locator('[data-testid=blocks-pane] .blocks-lock');
  await expect(lock).toContainText('Исправь ошибку в Python');
  const before = await startBlock(page).boundingBox();
  await dragStartBlock(page); await page.waitForTimeout(300);
  expect(await startBlock(page).boundingBox()).toEqual(before);
  expect(await getPython(page)).toBe(broken);
  await setPython(page, 'from robot import *\n\nwhile True:\n    stop()\n');
  await expect(page.getByTestId('python-error')).toBeHidden(); await expect(lock).toBeHidden();
  await dragFromToolboxIntoStart(page, 'Робот', 'ждать');
  await expect.poll(() => getPython(page)).toContain('wait(1)');
});
test('a block moved during the typing pause keeps the typed Python', async ({ page }) => {
  const typed = 'from robot import *\n\nstop()\n';
  await gotoProgram(page); await setPython(page, typed); await dragStartBlock(page);
  await expect(page.locator('svg.blocklySvg .blocklyBlockCanvas')).toContainText('стоп');
  expect(await getPython(page)).toBe(typed);
});

// Ruling R18a: saved blocks that no longer load are rebuilt from the saved Python.
const STALE_BLOCKS = [
  { type: 'robot_old_move', x: 0, y: 0 }, // unknown block type
  { type: 'robot_start', next: { block: { type: 'robot_wait', inputs: { SECONDS: { block: { type: 'math_number' } } } } } }, // unknown input
  5, // not a block list at all
];
for (const [i, stale] of STALE_BLOCKS.entries())
  test(`stale saved blocks are rebuilt from the saved Python (${i + 1})`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const python = 'from robot import *\n\nstop()\n';
    const blocks = { blocks: { languageVersion: 0, blocks: typeof stale === 'number' ? stale : [stale] } };
    const state = { v: 1, lang: 'ru', theme: null, step: 'program', trackId: 'first_steps', assembly: {}, python, blocks };
    await page.addInitScript(s => localStorage.setItem('robo-trassa:v1', s), JSON.stringify(state));
    await page.goto('/');
    const workspace = page.locator('svg.blocklySvg .blocklyBlockCanvas');
    await expect(workspace).toContainText('при запуске'); await expect(workspace).toContainText('стоп');
    expect(await getPython(page)).toBe(python);
    await expect(page.locator('.program-code .pane-title').first()).toHaveText('Блоки');
    await page.getByTestId('lang-kk').click(); await expect(workspace).toContainText('іске қосқанда');
    expect(errors).toEqual([]);
  });
test('language and theme switches keep the program; blocks re-labelled', async ({ page }) => {
  await gotoProgram(page); await setPython(page, readSolution('first_steps'));
  await page.getByTestId('theme-toggle').click(); await page.getByTestId('lang-kk').click();
  await expect(page.getByTestId('python-editor')).toContainText('motors(0, 50)');
  await expect(page.getByTestId('blocks-pane')).not.toContainText('повторять');
});
