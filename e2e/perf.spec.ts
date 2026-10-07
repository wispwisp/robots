import { expect, test } from '@playwright/test';
import { parseTimer, setupReference } from './helpers';

test('smooth at 4x CPU slowdown', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await setupReference(page, 'first_steps'); await page.getByTestId('run').click(); await page.waitForTimeout(1000);
  const t0 = parseTimer(await page.getByTestId('timer').textContent()); await page.waitForTimeout(5000);
  const t1 = parseTimer(await page.getByTestId('timer').textContent());
  expect(t1 - t0).toBeGreaterThanOrEqual(4.5); // the simulation keeps at least 90 % of real time
  const intervals = await page.evaluate(() => new Promise<number[]>(res => {
    const xs: number[] = []; let last = performance.now();
    const f = (t: number) => { xs.push(t - last); last = t; xs.length < 120 ? requestAnimationFrame(f) : res(xs); };
    requestAnimationFrame(f);
  }));
  intervals.sort((a, b) => a - b); expect(intervals[Math.floor(intervals.length / 2)]).toBeLessThanOrEqual(20);
});
