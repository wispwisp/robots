// A workspace without a page, for generating and converting code. Lists count from 0, as in Python.
import * as Blockly from 'blockly/core';

export function createHeadlessWorkspace(): Blockly.Workspace {
  return new Blockly.Workspace(new Blockly.Options({ oneBasedIndex: false }));
}
