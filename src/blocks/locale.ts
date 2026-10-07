// Blockly's messages for a language: Blockly's own Russian texts as the base, our Kazakh texts over them,
// Latin default names, no tooltips, then the texts of our blocks and toolbox.
import * as Blockly from 'blockly/core';
import * as BlocklyRu from 'blockly/msg/ru';
import { kk, ru, type Lang } from '../i18n';

// Blockly turns these into variable and function names, which must be valid Python names.
const LATIN_DEFAULT_NAMES = {
  VARIABLES_DEFAULT_NAME: 'item',
  PROCEDURES_DEFNORETURN_PROCEDURE: 'do_something',
  PROCEDURES_DEFRETURN_PROCEDURE: 'do_something',
  UNNAMED_KEY: 'unnamed',
};

export function applyBlocklyLocale(lang: Lang): void {
  Blockly.setLocale(BlocklyRu as unknown as Record<string, string>);
  if (lang === 'kk') Object.assign(Blockly.Msg, kk.blocklyBuiltins);
  Object.assign(Blockly.Msg, LATIN_DEFAULT_NAMES);
  // Tooltips are not translated, so none are shown (no Russian hints in Kazakh mode).
  for (const key of Object.keys(Blockly.Msg)) if (key.includes('TOOLTIP')) Blockly.Msg[key] = '';
  Object.assign(Blockly.Msg, lang === 'kk' ? kk.blocks : ru.blocks);
}
