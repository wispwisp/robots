// Names of variables, functions and parameters: Latin letters, digits and _, and not a Python keyword
// (Skulpt rejects other letters).
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import { t } from '../i18n';

const KEYWORDS = new Set(('False None True and as assert async await break class continue def del elif else except '
  + 'finally for from global if import in is lambda nonlocal not or pass raise return try while with yield').split(' '));

export function isValidName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !KEYWORDS.has(name);
}

let installed = false;

// Blockly asks for variable names with its prompt dialog; function and parameter names are typed into fields.
export function installNameValidation(): void {
  if (installed) return;
  installed = true;

  // An invalid name is explained and asked again with the typed text; null (Cancel) and '' pass through.
  Blockly.dialog.setPrompt((message, defaultValue, callback) => {
    let name = prompt(message, defaultValue);
    while (name !== null && name.trim() !== '' && !isValidName(name.trim())) {
      alert(t('nameLatinOnly'));
      name = prompt(message, name);
    }
    callback(name);
  });

  // A validator returning null rejects the typed name; the field keeps its previous name.
  for (const type of ['procedures_defnoreturn', 'procedures_defreturn', 'procedures_mutatorarg']) {
    const definition = Blockly.Blocks[type];
    const init = definition.init;
    definition.init = function (this: Blockly.Block) {
      init.call(this);
      const field = this.getField('NAME')!;
      const blocklyValidator = field.getValidator();
      field.setValidator(function (this: Blockly.Field, name: string) {
        if (!isValidName(name.trim())) return null;
        return blocklyValidator ? blocklyValidator.call(this, name) : name;
      });
    };
  }
}
