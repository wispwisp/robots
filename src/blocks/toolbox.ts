// The toolbox. Category names are Blockly messages, so buildToolbox() follows applyBlocklyLocale().
import * as Blockly from 'blockly/core';
import { OTHER_COLOUR, ROBOT_COLOUR, SENSOR_COLOUR } from './definitions';

type BlockInfo = Blockly.utils.toolbox.BlockInfo;
type FlyoutItem = Blockly.utils.toolbox.FlyoutItemInfo;

const block = (type: string, extra: Partial<BlockInfo> = {}): BlockInfo => ({ kind: 'block', type, ...extra });
const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
const category = (name: string, style: { colour: string } | { categorystyle: string }, contents: FlyoutItem[]) =>
  ({ kind: 'category', name: `%{BKY_${name}}`, ...style, contents });

export function buildToolbox(): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: 'categoryToolbox',
    contents: [
      category('CAT_ROBOT', { colour: ROBOT_COLOUR }, [
        block('robot_motors', { inputs: { L: num(50), R: num(50) } }),
        block('robot_stop'),
        block('robot_wait', { inputs: { S: num(1) } }),
      ]),
      category('CAT_SENSORS', { colour: SENSOR_COLOUR }, [
        block('robot_line', { fields: { SLOT: 'front_left' } }),
        block('robot_brightness', { fields: { SLOT: 'front_center' } }),
        block('robot_distance', { fields: { SLOT: 'front_center' } }),
        block('robot_color', { fields: { SLOT: 'right' } }),
        block('logic_compare', { inputs: {
          A: { block: { type: 'robot_color', fields: { SLOT: 'right' } } },
          B: { block: { type: 'robot_color_value', fields: { COLOR: 'red' } } },
        } }),
        block('robot_color_value'),
      ]),
      category('CAT_LOGIC', { categorystyle: 'logic_category' }, [
        block('controls_if'),
        block('controls_if', { extraState: { hasElse: true } }),
        block('logic_compare'),
        block('logic_operation'),
        block('logic_negate'),
        block('logic_boolean'),
      ]),
      category('CAT_LOOPS', { categorystyle: 'loop_category' }, [
        block('controls_forever'),
        block('controls_while'),
        block('controls_repeat_ext', { inputs: { TIMES: num(10) } }),
        block('py_for_range', { inputs: { START: num(0), STOP: num(5), STEP: num(1) } }),
        block('controls_forEach'),
        block('controls_flow_statements'),
      ]),
      category('CAT_MATH', { categorystyle: 'math_category' }, [
        block('math_number', { fields: { NUM: 0 } }),
        block('py_binop', { inputs: { A: num(1), B: num(1) } }),
        block('py_neg'),
        block('py_math_func'),
      ]),
      { kind: 'category', name: '%{BKY_CAT_VARIABLES}', categorystyle: 'variable_category', custom: 'VARIABLE' },
      category('CAT_LISTS', { categorystyle: 'list_category' }, [
        block('lists_create_with', { extraState: { itemCount: 0 } }),
        block('lists_create_with', { extraState: { itemCount: 3 } }),
        block('py_list_get', { inputs: { INDEX: num(0) } }),
        block('py_list_set', { inputs: { INDEX: num(0) } }),
        block('py_list_append'),
        block('py_len'),
      ]),
      { kind: 'category', name: '%{BKY_CAT_FUNCTIONS}', categorystyle: 'procedure_category', custom: 'PROCEDURE' },
      category('CAT_TEXT', { categorystyle: 'text_category' }, [
        block('text'),
        block('text_print', { inputs: { TEXT: { shadow: { type: 'text' } } } }),
      ]),
      category('CAT_OTHER', { colour: OTHER_COLOUR }, [block('python_code'), block('comment_note')]),
    ],
  };
}

// Blockly's own Variables and Functions categories offer math_change and procedures_ifreturn, which are not
// in our block set; ours offer var_change and py_return in their place. Call after Blockly.inject.
export function registerToolboxCallbacks(ws: Blockly.WorkspaceSvg): void {
  const replace = (items: FlyoutItem[], type: string, by: (item: BlockInfo) => BlockInfo) =>
    items.map(item => item.kind === 'block' && (item as BlockInfo).type === type ? by(item as BlockInfo) : item);
  ws.registerToolboxCategoryCallback('VARIABLE', w =>
    replace(Blockly.Variables.flyoutCategory(w), 'math_change', item => ({ ...item, type: 'var_change' })));
  ws.registerToolboxCategoryCallback('PROCEDURE', w =>
    replace(Blockly.Procedures.flyoutCategory(w), 'procedures_ifreturn', item => block('py_return', { gap: item.gap })));
}
