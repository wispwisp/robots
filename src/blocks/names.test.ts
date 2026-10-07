import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { setLang, t } from '../i18n';
import { registerBlocks } from './definitions';
import { applyBlocklyLocale } from './locale';
import { installNameValidation, isValidName } from './names';
import { createHeadlessWorkspace } from './workspace';

beforeAll(() => { registerBlocks(); applyBlocklyLocale('ru'); installNameValidation(); });
afterEach(() => { vi.unstubAllGlobals(); setLang('ru'); });

test('names', () => { expect(isValidName('speed_2')).toBe(true); expect(isValidName('скорость')).toBe(false);
  expect(isValidName('2x')).toBe(false); expect(isValidName('while')).toBe(false); });

test('more names', () => {
  for (const ok of ['_', 'x', 'Speed', 'print', 'sum', 'motors']) expect(isValidName(ok), ok).toBe(true);
  for (const bad of ['', 'a b', 'a-b', 'True', 'None', 'and', 'def', 'résumé', 'x\n']) expect(isValidName(bad), bad).toBe(false);
});

test('the name dialog refuses an invalid name, explains and asks again', () => {
  setLang('kk');
  const answers = ['скорость', 'speed'];
  const prompt = vi.fn((_message: string, _default: string) => answers.shift() ?? null);
  const alert = vi.fn();
  vi.stubGlobal('prompt', prompt);
  vi.stubGlobal('alert', alert);
  const result = vi.fn();
  Blockly.dialog.prompt('Name?', '', result);
  expect(alert).toHaveBeenCalledExactlyOnceWith(t('nameLatinOnly'));
  expect(prompt).toHaveBeenCalledTimes(2);
  expect(prompt.mock.calls[1]).toEqual(['Name?', 'скорость']);
  expect(result).toHaveBeenCalledExactlyOnceWith('speed');
});

test('cancelling the name dialog passes null on', () => {
  vi.stubGlobal('prompt', vi.fn(() => null));
  vi.stubGlobal('alert', vi.fn());
  const result = vi.fn();
  Blockly.dialog.prompt('Name?', 'x', result);
  expect(result).toHaveBeenCalledExactlyOnceWith(null);
});

test('function and parameter name fields reject invalid names', () => {
  const ws = createHeadlessWorkspace();
  for (const type of ['procedures_defnoreturn', 'procedures_defreturn']) {
    const def = ws.newBlock(type);
    def.setFieldValue('go_' + type.length, 'NAME');
    def.setFieldValue('скорость', 'NAME');
    def.setFieldValue('if', 'NAME');
    expect(def.getFieldValue('NAME')).toBe('go_' + type.length);
  }
  const arg = ws.newBlock('procedures_mutatorarg');
  arg.setFieldValue('скорость', 'NAME');
  expect(arg.getFieldValue('NAME')).toBe('x');
});
