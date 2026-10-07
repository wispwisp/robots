// Our custom blocks. Their texts are Blockly messages (`%{BKY_…}`, set by applyBlocklyLocale);
// slot and colour labels are read from i18n when a block is created.
import { registerFieldMultilineInput } from '@blockly/field-multilineinput';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import { colorLabel, slotLabel } from '../i18n';
import { SLOT_NAMES } from '../robot/robot';
import type { ColorName } from '../tracks/surface';

export const ROBOT_COLOUR = '#d9822b';
export const SENSOR_COLOUR = '#2a9db0';
export const OTHER_COLOUR = '#7d7d7d';

const COLOR_NAMES: ColorName[] = ['red', 'green', 'black', 'white'];
const OPERATORS = ['+', '-', '*', '/', '//', '%', '**'];

type Json = Record<string, unknown>;
type Look = { colour: string } | { style: string };
const ROBOT = { colour: ROBOT_COLOUR };
const SENSOR = { colour: SENSOR_COLOUR };
const OTHER = { colour: OTHER_COLOUR };
const MATH = { style: 'math_blocks' };
const LIST = { style: 'list_blocks' };

const statementBlock = (message0: string, args0: Json[], look: Look): Json =>
  ({ message0, args0, inputsInline: true, previousStatement: null, nextStatement: null, ...look });
const valueBlock = (message0: string, args0: Json[], look: Look): Json =>
  ({ message0, args0, inputsInline: true, output: null, ...look });
const loop = (message0: string, args0: Json[]): Json => ({
  ...statementBlock(message0, args0, { style: 'loop_blocks' }),
  message1: '%{BKY_CONTROLS_REPEAT_INPUT_DO} %1', args1: [{ type: 'input_statement', name: 'DO' }],
});
const input = (name: string) => ({ type: 'input_value', name });
const dropdown = (name: string, options: [string, string][]) => ({ type: 'field_dropdown', name, options });
const variable = (name: string) => ({ type: 'field_variable', name: 'VAR', variable: name });
const sensor = (message0: string) =>
  valueBlock(message0, [dropdown('SLOT', SLOT_NAMES.map(s => [slotLabel(s), s]))], SENSOR);

// Each definition is built when a block is created, so labels follow the current language.
const BLOCKS: Record<string, () => Json> = {
  robot_start: () => ({ message0: '%{BKY_ROBOT_START}', nextStatement: null, style: 'hat_blocks' }),
  robot_motors: () => statementBlock('%{BKY_ROBOT_MOTORS}', [input('L'), input('R')], ROBOT),
  robot_stop: () => statementBlock('%{BKY_ROBOT_STOP}', [], ROBOT),
  robot_wait: () => statementBlock('%{BKY_ROBOT_WAIT}', [input('S')], ROBOT),
  robot_line: () => sensor('%{BKY_ROBOT_LINE}'),
  robot_brightness: () => sensor('%{BKY_ROBOT_BRIGHTNESS}'),
  robot_distance: () => sensor('%{BKY_ROBOT_DISTANCE}'),
  robot_color: () => sensor('%{BKY_ROBOT_COLOR}'),
  robot_color_value: () => valueBlock('%1', [dropdown('COLOR', COLOR_NAMES.map(c => [colorLabel(c), c]))], SENSOR),

  controls_forever: () => loop('%{BKY_CONTROLS_FOREVER}', []),
  controls_while: () => loop('%{BKY_CONTROLS_WHILE}', [input('COND')]),
  py_for_range: () => loop('%{BKY_PY_FOR_RANGE}', [variable('i'), input('START'), input('STOP'), input('STEP')]),

  py_binop: () => valueBlock('%1 %2 %3', [input('A'), dropdown('OP', OPERATORS.map(op => [op, op])), input('B')], MATH),
  py_neg: () => valueBlock('- %1', [input('VALUE')], MATH),
  py_math_func: () => valueBlock('%1 %2', [
    dropdown('FUNC', [['%{BKY_PY_MATH_ABS}', 'abs'], ['%{BKY_PY_MATH_ROUND}', 'round']]),
    input('VALUE'),
  ], MATH),

  var_change: () => statementBlock('%{BKY_VAR_CHANGE}', [
    variable('%{BKY_VARIABLES_DEFAULT_NAME}'),
    dropdown('OP', [['%{BKY_VAR_CHANGE_ADD}', '+='], ['%{BKY_VAR_CHANGE_SUB}', '-=']]),
    input('DELTA'),
  ], { style: 'variable_blocks' }),
  py_return: () => statementBlock('%{BKY_PY_RETURN}', [input('VALUE')], { style: 'procedure_blocks' }),

  py_list_get: () => valueBlock('%{BKY_PY_LIST_GET}', [input('LIST'), input('INDEX')], LIST),
  py_list_set: () => statementBlock('%{BKY_PY_LIST_SET}', [input('LIST'), input('INDEX'), input('VALUE')], LIST),
  py_list_append: () => statementBlock('%{BKY_PY_LIST_APPEND}', [input('LIST'), input('VALUE')], LIST),
  py_len: () => valueBlock('%{BKY_PY_LEN}', [input('LIST')], LIST),

  python_code: () => ({
    ...statementBlock('%{BKY_PYTHON_CODE}', [], OTHER),
    message1: '%1', args1: [{ type: 'field_multilinetext', name: 'CODE', text: '', spellcheck: false }],
  }),
  comment_note: () => statementBlock('%{BKY_COMMENT_NOTE}', [{ type: 'field_input', name: 'TEXT', text: '' }], OTHER),
};

// Python is not typed: any value block fits any value input (`if distance(…):`, `for ch in "abc":`),
// so every program the Python → blocks converter reads can be loaded.
class UntypedConnectionChecker extends Blockly.ConnectionChecker {
  doTypeChecks(): boolean {
    return true;
  }
}

let registered = false;

export function registerBlocks(): void {
  if (registered) return;
  registered = true;
  registerFieldMultilineInput();
  const { register, Type, DEFAULT } = Blockly.registry;
  register(Type.CONNECTION_CHECKER, DEFAULT, UntypedConnectionChecker, true);
  for (const [type, json] of Object.entries(BLOCKS)) {
    Blockly.Blocks[type] = {
      init(this: Blockly.Block) {
        this.jsonInit(json());
        // The single «when started» block: no Delete, Duplicate or Disable.
        if (type === 'robot_start') {
          this.setDeletable(false);
          this.contextMenu = false;
        }
      },
    };
  }
  // Python allows statements after break/continue, so blocks can go below them too.
  const flow = Blockly.Blocks.controls_flow_statements;
  const flowInit = flow.init;
  flow.init = function (this: Blockly.Block) {
    flowInit.call(this);
    this.setNextStatement(true);
  };
}
