// Russian texts — the reference dictionary: every other language must have the same keys.
import * as BlocklyRu from 'blockly/msg/ru';
import { BLOCKLY_BUILTIN_KEYS, type BlocklyBuiltinKey } from './blocklyKeys';

// `{name}` marks a value filled in by t().
const ui = {
  // header
  appName: 'Робо-трасса',
  stepAssembly: '1 Сборка',
  stepProgram: '2 Программа',
  langRu: 'RU',
  langKk: 'ҚАЗ',
  themeToggle: 'Светлая / тёмная тема',
  newProject: 'Новый проект',
  confirmNewProject: 'Начать новый проект? Сборка и программа будут удалены.',
  windowTooSmall: 'Окно слишком маленькое. Разверни браузер на весь экран.',

  // assembly screen
  partsTitle: 'Детали',
  robotTitle: 'Робот (вид сверху)',
  slotsTitle: 'Слоты',
  assemblyHint: 'Перетащи датчик в слот на роботе или нажми на датчик, а потом на слот',
  assemblyHintPick: 'Теперь нажми на слот на роботе',
  robotForward: '▲ вперёд',
  motor: 'мотор',
  slotEmpty: 'пусто',
  removeSensor: 'Убрать датчик',
  toProgram: 'Далее: программа →',
  sensor_line: 'Датчик линии',
  sensor_distance: 'Датчик расстояния',
  sensor_color: 'Датчик цвета',
  sensorGen_line: 'линии',
  sensorGen_distance: 'расстояния',
  sensorGen_color: 'цвета',
  slot_front_left: 'перед-лево',
  slot_front_center: 'перед-центр',
  slot_front_right: 'перед-право',
  slot_left: 'лево',
  slot_right: 'право',

  // program screen and running
  blocksTitle: 'Блоки',
  pythonTitle: 'Python — тот же код',
  blocksLocked: 'Исправь ошибку в Python — потом можно менять блоки',
  trackLabel: 'Трасса',
  track_first_steps: 'Первые шаги',
  track_barrier: 'Шлагбаум',
  track_colors: 'Цвета',
  run: '▶ Запуск',
  stop: '■ Стоп',
  reset: '↺ Сброс',
  timerLabel: 'время',
  readingsTitle: 'Показания датчиков',
  outputTitle: 'Вывод print',
  readingYes: 'ДА',
  readingNo: 'нет',
  readingBrightness: 'яркость {value}',
  readingDistance: '{value} см',
  sensorShort_line: 'линия', // the sensor's type in a readings row, the same word as in its block
  sensorShort_distance: 'расстояние',
  sensorShort_color: 'цвет',
  color_black: 'чёрный',
  color_white: 'белый',
  color_red: 'красный',
  color_green: 'зелёный',

  // run results
  trackComplete: 'Трасса пройдена! ⏱ {time}',
  crash: 'Авария!',
  offField: 'Робот уехал с поля',
  missedRed: 'Не остановился на красном',
  programEnded: 'Программа завершена',

  // program errors
  lineN: 'Строка {line}',
  sensorMissing: 'В слоте «{slot}» нет датчика {sensorGen}',
  unknownSlot: 'Слота «{slot}» нет. Есть: front_left, front_center, front_right, left, right',
  nameNotFound: 'Имя «{name}» не найдено — может быть, опечатка?',
  nameLatinOnly: 'Имя может содержать только латинские буквы, цифры и _',
  syntaxError: 'Ошибка в записи кода: проверь скобки, двоеточия и кавычки.',
  indentationError: 'Неправильный отступ: проверь пробелы в начале строки.',
  typeError: 'Значение не того типа: например, текст там, где нужно число.',
  valueError: 'Неподходящее значение: проверь числа в этой строке.',
  zeroDivisionError: 'На ноль делить нельзя.',
  indexError: 'В списке нет элемента с таким номером. Номера начинаются с 0.',
} as const;

// Our blocks and toolbox, in Blockly message style: `%1`, `%2` are the block's inputs and fields.
const blocks = {
  CAT_ROBOT: 'Робот',
  CAT_SENSORS: 'Датчики',
  CAT_LOGIC: 'Логика',
  CAT_LOOPS: 'Циклы',
  CAT_MATH: 'Числа',
  CAT_VARIABLES: 'Переменные',
  CAT_LISTS: 'Списки',
  CAT_FUNCTIONS: 'Функции',
  CAT_TEXT: 'Текст',
  CAT_OTHER: 'Прочее',

  ROBOT_START: 'при запуске',
  ROBOT_MOTORS: 'моторы: лев %1 прав %2',
  ROBOT_STOP: 'стоп',
  ROBOT_WAIT: 'ждать %1 сек',
  ROBOT_LINE: 'линия · %1',
  ROBOT_BRIGHTNESS: 'яркость · %1',
  ROBOT_DISTANCE: 'расстояние · %1',
  ROBOT_COLOR: 'цвет · %1',

  CONTROLS_FOREVER: 'повторять всегда',
  CONTROLS_WHILE: 'повторять пока %1',
  PY_FOR_RANGE: 'для %1 от %2 до %3 с шагом %4',
  PY_MATH_ABS: 'модуль',
  PY_MATH_ROUND: 'округлить',
  VAR_CHANGE: '%2 %1 на %3', // %1 variable, %2 operation, %3 amount: «увеличить speed на 2»
  VAR_CHANGE_ADD: 'увеличить', // the operation's labels; in Python they are += and -=
  VAR_CHANGE_SUB: 'уменьшить',
  PY_RETURN: 'вернуть %1',
  PY_LIST_GET: 'элемент %2 из списка %1',
  PY_LIST_SET: 'в списке %1 элемент %2 заменить на %3',
  PY_LIST_APPEND: 'в конец списка %1 добавить %2',
  PY_LEN: 'длина %1',
  PYTHON_CODE: 'Python-код',
  COMMENT_NOTE: 'заметка: %1',
  // hint under the «Python-код» text editor (@blockly/field-multilineinput)
  FIELD_MULTILINEINPUT_FINISH_EDITING: 'готово',
  FIELD_MULTILINEINPUT_NEW_LINE: 'новая строка',
} as const;

// Blockly's typings (msg/msg.d.ts) lag behind its Blockly 13 message files, so the keys are read untyped;
// the i18n test checks that each one has a text.
const blocklyRu = BlocklyRu as unknown as Record<string, string>;

export const ru = {
  ui,
  blocks,
  blocklyBuiltins: Object.fromEntries(BLOCKLY_BUILTIN_KEYS.map(k => [k, blocklyRu[k]])) as Record<BlocklyBuiltinKey, string>,
} as const;

export type Dict = {
  ui: Record<keyof typeof ru.ui, string>;
  blocks: Record<keyof typeof ru.blocks, string>;
  blocklyBuiltins: Record<BlocklyBuiltinKey, string>;
};
