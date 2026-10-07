// The live readings next to the track: one row per sensor, the run timer and the last lines of print output.
// The rows are built once per sensor set and language; each frame only changes the texts that differ.
import { colorLabel, getLang, slotLabel, t } from '../i18n';
import type { Reading } from '../sim/sensors';

interface Rows { key: string; values: HTMLElement[]; timer: HTMLElement; output: HTMLElement }

const built = new WeakMap<HTMLElement, Rows>();

// "mm:ss.s", e.g. 00:23.4
export function formatTime(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const minutes = String(Math.floor(tenths / 600)).padStart(2, '0');
  return `${minutes}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
}

export function renderReadings(el: HTMLElement, readings: Reading[], time: number, output: string[]): void {
  const key = getLang() + readings.map(r => ` ${r.slot}:${r.type}`).join('');
  const cached = built.get(el);
  const rows = cached?.key === key ? cached : build(el, readings, key);
  readings.forEach((r, i) => setText(rows.values[i], valueText(r)));
  setText(rows.timer, formatTime(time));
  setText(rows.output, output.join('\n'));
}

function build(el: HTMLElement, readings: Reading[], key: string): Rows {
  el.innerHTML = `
    <div class="readings-sensors">
      <h3 class="readings-title">${t('readingsTitle')}</h3>${readings.map(r => `
      <span class="reading-dot" data-type="${r.type}"></span><span>${slotLabel(r.slot)}</span>
      <span class="reading-type">${t(`sensorShort_${r.type}`)}</span><b class="reading-value"></b>`).join('')}
      <span>⏱</span><span>${t('timerLabel')}</span><span></span><b class="reading-value" data-testid="timer"></b>
    </div>
    <div class="readings-output">
      <h3 class="readings-title">${t('outputTitle')}</h3>
      <pre class="output-lines"></pre>
    </div>`;
  const rows: Rows = {
    key,
    values: [...el.querySelectorAll<HTMLElement>('.reading-value:not([data-testid])')],
    timer: el.querySelector<HTMLElement>('[data-testid=timer]')!,
    output: el.querySelector<HTMLElement>('.output-lines')!,
  };
  built.set(el, rows);
  return rows;
}

// «ДА · яркость 14», «74 см», «белый»
function valueText(r: Reading): string {
  switch (r.type) {
    case 'line': return `${t(r.line ? 'readingYes' : 'readingNo')} · ${t('readingBrightness', { value: r.brightness! })}`;
    case 'distance': return t('readingDistance', { value: r.distance! });
    case 'color': return colorLabel(r.color!);
  }
}

function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}
