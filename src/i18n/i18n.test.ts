import { expect, test, vi } from 'vitest';
import { BLOCKLY_BUILTIN_KEYS } from './blocklyKeys';
import { formatProgramError, kk, onLangChange, ru, setLang, slotLabel, t } from './index';

test('placeholders', () => { setLang('ru'); expect(t('nameNotFound', { name: 'motor' })).toBe('Имя «motor» не найдено — может быть, опечатка?'); });
test('sensor error message', () => { setLang('ru');
  expect(formatProgramError({ kind: 'SensorError', line: 3, message: '', slot: 'left', needed: 'line' })).toBe('Строка 3: В слоте «лево» нет датчика линии'); });
test('other errors keep English text', () => { setLang('ru');
  expect(formatProgramError({ kind: 'Other', line: null, message: 'KeyError: x' })).toBe('KeyError: x'); });
test('kk has no empty strings', () => { for (const v of Object.values(kk.ui)) expect(v.trim()).not.toBe(''); });
test('language change notifies', () => { const f = vi.fn(); const off = onLangChange(f); setLang('kk'); expect(f).toHaveBeenCalled(); off(); setLang('ru'); });

test('unknown slot lists the real slot names', () => { setLang('ru');
  expect(formatProgramError({ kind: 'SensorError', line: 2, message: '', slot: 'middle', needed: null }))
    .toBe('Строка 2: Слота «middle» нет. Есть: front_left, front_center, front_right, left, right'); });

test('texts follow the language', () => {
  setLang('kk'); expect(slotLabel('left')).toBe(kk.ui.slot_left); expect(formatProgramError({ kind: 'ZeroDivisionError', line: 4, message: '' })).toMatch(/^4-жол: /);
  setLang('ru'); expect(slotLabel('left')).toBe('лево');
});

test('every Blockly built-in key has Russian text from Blockly', () => {
  for (const key of BLOCKLY_BUILTIN_KEYS) expect(ru.blocklyBuiltins[key]?.trim(), key).toBeTruthy();
});

test('kk blocks and Blockly texts are not empty', () => {
  for (const v of [...Object.values(kk.blocks), ...Object.values(kk.blocklyBuiltins)]) expect(v.trim()).not.toBe('');
});

// %1-style placeholders (Blockly) and {name}-style placeholders (ui) must survive translation.
const placeholders = (s: string) => (s.match(/%\d+|\{\w+\}/g) ?? []).sort();
test('kk keeps the Russian placeholders', () => {
  for (const section of ['ui', 'blocks', 'blocklyBuiltins'] as const) {
    const ruTexts: Record<string, string> = ru[section];
    for (const [key, text] of Object.entries(kk[section])) expect(placeholders(text), key).toEqual(placeholders(ruTexts[key]));
  }
});
