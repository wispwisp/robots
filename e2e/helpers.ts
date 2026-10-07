// Shared steps for the end-to-end tests. Each test starts with an empty browser profile, so a new project.
import { expect, type Page } from '@playwright/test';
import type { TrackId } from '../src/tracks/tracks';
import { readSolution, REFERENCE_ASSEMBLY } from '../tests/solutions/reference';

export async function gotoProgram(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('step-program').click();
  await expect(page.getByTestId('python-editor')).toBeVisible();
}

// A new project: the reference robot (sensors placed by clicking), the track and its solution typed in; not run.
export async function setupReference(page: Page, id: TrackId): Promise<void> {
  page.once('dialog', d => d.accept());
  await page.goto('/'); await page.getByTestId('new-project').click();
  for (const [slot, type] of Object.entries(REFERENCE_ASSEMBLY)) {
    await page.getByTestId(`tray-${type}`).click(); await page.getByTestId(`slot-${slot}`).click();
  }
  await page.getByTestId('to-program').click(); await page.getByTestId('track-select').selectOption(id);
  await setPython(page, readSolution(id));
}

// Replaces the whole Python text. insertText types it in one go, so CodeMirror doesn't auto-indent it.
export async function setPython(page: Page, text: string): Promise<void> {
  await page.getByTestId('python-editor').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

// The readings timer text «mm:ss.s» (e.g. «00:04.0») in seconds; NaN for null or anything else.
export function parseTimer(text: string | null): number {
  const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec((text ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

// The editor's exact text (its lines; a short program is fully rendered).
export async function getPython(page: Page): Promise<string> {
  return (await page.locator('[data-testid=python-editor] .cm-line').allTextContents()).join('\n');
}

const category = (page: Page, name: string) =>
  page.getByTestId('blocks-pane').locator('.blocklyToolboxCategory', { hasText: name });

export async function openVariablesCategoryAndClickCreate(page: Page): Promise<void> {
  await category(page, 'Переменные').click();
  await page.locator('.blocklyFlyoutButton', { hasText: 'Создать переменную' }).click();
}

// Drags a block from a toolbox category and drops it right under «при запуске».
export async function dragFromToolboxIntoStart(page: Page, categoryName: string, blockLabel: string): Promise<void> {
  await category(page, categoryName).click();
  const block = page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: blockLabel }).first();
  const start = page.locator('svg.blocklySvg .blocklyBlockCanvas > .blocklyDraggable').filter({ hasText: 'при запуске' });
  const from = (await block.boundingBox())!;
  const to = (await start.boundingBox())!;
  // Held 10 px inside the block's top-left corner, so its top-left lands on the start block's bottom-left.
  await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.down();
  // First away from the flyout, which may lie right over the drop point: the drag must really start.
  await page.mouse.move(from.x + 200, from.y + 10, { steps: 5 });
  await page.mouse.move(to.x + 10, to.y + to.height + 10, { steps: 10 });
  await page.mouse.up();
}
