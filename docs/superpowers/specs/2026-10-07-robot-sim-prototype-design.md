# Robot Simulator Prototype — Design

Date: 2026-10-07
Status: approved in brainstorming, awaiting written-spec review

## 1. Purpose and success criteria

A browser-based, top-down 2D robotics simulator for school students aged 8–16.
This prototype exists to be demoed to a customer.

**Done when** a 90-second video can be recorded showing:
new project → robot assembled → program built with blocks (Python visible
alongside) → robot run → «Трасса пройдена!» on a track. The same build is
published at a public link so the customer can try it.

## 2. Scope

In scope (student-facing only):
1. Robot assembly: chassis with two motors, sensors placed into slots.
2. Programming with blocks, synchronised in both directions with Python.
3. Running the program on one of three tracks with live sensor readings.

Out of scope: teacher dashboard, accounts, competitions, 3D, backend,
phones/tablets, browsers other than Chrome (others may work but are untested).

Constraints: frontend only, static hosting, no sign-up, UI in Russian and
Kazakh (Cyrillic), must run smoothly in Chrome on a low-end school laptop
(1366×768 screen).

## 3. Dependencies

| Dependency | Decision |
|---|---|
| Vite + TypeScript | Build and language. `base: './'` so the build works under any path. |
| Blockly 13 | Block editor and blocks → Python generation. Zero-based list indexing (`oneBasedIndex: false`). Blockly has no Kazakh locale; we translate the blocks we use ourselves. |
| `@blockly/theme-dark` | Dark theme for the block workspace. |
| Skulpt (pinned, vendored) | The only Python execution path, and the Python parser for Python → blocks. Python 3 mode. Standard library included so `import math` / `import random` work. |
| CodeMirror 6 | Python editor: syntax colouring, error underline, current-line highlight, light and dark themes. Chosen over a textarea (no highlighting) and Monaco (too heavy). |
| Canvas 2D | Rendering. No physics engine; differential-drive kinematics. |
| GitHub Pages + GitHub Actions | Static deployment on every push to `main`. |
| Vitest, Playwright | Unit tests and end-to-end tests. |

Rejected: Pyodide (~10 MB download; interrupting needs `SharedArrayBuffer`,
which needs headers GitHub Pages can't send), Brython (an infinite loop freezes
the tab), BlockMirror/BlockPy's converter (targets old Blockly and CodeMirror 5,
full-Python block set instead of a child-friendly one). No i18n library — a
plain dictionary per language.

## 4. Robot and assembly

### Chassis
- Top-down robot, 15 cm wide × 18 cm long. Its position is the midpoint
  between the two wheels, at the centre of the body; wheels are 16 cm apart.
- Motor speed −100…100 per wheel; 100 = 30 cm/s. Speed changes are instant.
  Movement follows differential-drive kinematics: linear speed is the wheel
  average, turn rate is the wheel difference divided by the wheel spacing.

### Slots
Each slot has a real position (relative to the robot's centre; x forward,
y left) and a direction it faces.

| Python name | Russian label | Position | Faces |
|---|---|---|---|
| `front_left` | перед-лево | x = 9, y = 2.5 cm | forward |
| `front_center` | перед-центр | x = 9, y = 0 | forward |
| `front_right` | перед-право | x = 9, y = −2.5 cm | forward |
| `left` | лево | x = 4, y = 7.5 cm | left |
| `right` | право | x = 4, y = −7.5 cm | right |

### Placing sensors
- Assembly screen: parts tray (line, distance, colour sensor) | top-down robot
  with the five slots | list of slots with their contents and a
  «Далее: программа →» button. Mockup: `docs/mockups/layout-options.html`.
- Place by dragging a sensor onto a slot, or by clicking a sensor then a slot.
- Remove by dragging a sensor off the robot or clicking its ✕.
- One sensor per slot; unlimited supply of each type; any type in any slot.
- Proceeding to programming with no sensors placed is allowed.

### Sensor behaviour
No random noise anywhere: the same program always produces the same run.

- **Line sensor** looks straight down at the floor under its slot.
  - `brightness(slot)` → 0–100, derived from the mat image under the slot,
    calibrated so black line ≈ 10, white mat ≈ 95, red ≈ 55, green ≈ 60.
    Coloured zones are painted over the line (the line is not visible
    inside them).
    Anti-aliased edges of the line give in-between values.
  - `line(slot)` → `brightness(slot) < 50`. Red and green are therefore
    "not line", so a simple two-sensor follower drives straight across them.
- **Distance sensor** casts a ray from its slot in the direction the slot
  faces. It sees obstacles (the closed barrier), not the line or mat edges.
  Returns whole centimetres from the slot to the hit point, maximum 100
  (also returned when nothing is in range).
- **Colour sensor** looks straight down; returns the nearest of `"black"`,
  `"white"`, `"red"`, `"green"`.

### Wrong slot
Reading a slot that doesn't hold the needed sensor type (or reading an
unknown slot name) stops the program with a translated message, e.g.
«В слоте "лево" нет датчика линии», and highlights the block and Python line.

## 5. Programming

### Robot commands (Python names are English; block labels are translated)

| Python | Block (ru) | Notes |
|---|---|---|
| `motors(left, right)` | моторы: лев [ ] прав [ ] | values outside −100…100 are clamped |
| `stop()` | стоп | both speeds to 0 |
| `wait(seconds)` | ждать [ ] сек | robot keeps moving at current speeds |
| `line(slot)` | линия · [slot ▾] | True/False |
| `brightness(slot)` | яркость · [slot ▾] | 0–100 |
| `distance(slot)` | расстояние · [slot ▾] | cm |
| `color(slot)` | цвет · [slot ▾] | compared with a colour block [красный ▾] → `"red"` |

Generated Python always starts with `from robot import *`. When reading
Python, that line produces no block. The robot commands also work if the
student deletes the import.

### Supported Python ↔ block constructs
- Statements: assignment to a name, `+=`/`-=`, `if`/`elif`/`else`,
  `while True:` (repeat forever), `while cond:`, `for name in range(...)`
  (1–3 arguments), `for name in list:`, `break`, `continue`, `print(...)`,
  whole-line comments, robot commands, function calls.
- Expressions: numbers, strings, `True`/`False`, variables, `+ - * / // % **`,
  unary minus, comparisons (`== != < > <= >=`), `and`/`or`/`not`, `abs()`,
  `round()`, robot sensor calls, function calls.
- Functions: top-level `def name(params):`, with or without a returned
  value; `return` anywhere in the body. Calls as statements or expressions.
- Lists: `[a, b, c]`, `[]`, `x[i]` (including negative indices), `x[i] = v`,
  `x.append(v)`, `len(x)`, `for item in x:`. Indices count from 0.
- **Everything else** (dicts, classes, comprehensions, `lambda`, `try`,
  `import`, nested `def`, list methods other than `append`, …) becomes a grey
  **«Python-код»** block holding the original text of the whole statement,
  including its nested body. Its text is editable inside the block and it runs
  normally.
- Comments: a whole-line comment becomes a small note block at that place. A
  comment at the end of a code line becomes a note block just before that
  statement (no comment text is ever dropped).

### Names
Variable, function and parameter names may use only Latin letters, digits
and `_` (Skulpt 1.2.0 rejects other letters). Block dialogs refuse other
names with a translated hint («Имя может содержать только латинские буквы,
цифры и _»); a Cyrillic name typed in Python shows the same hint as its
syntax error.

### Program structure
- The main program is the stack under the single, undeletable
  «при запуске» (when started) block.
- Function definitions are separate top-level blocks; in Python they come
  before the main program.
- Any other loose block is greyed out and generates no code.

### Python output rules
Generated Python must look like what a teacher would write. Where Blockly's
default output doesn't, it is customised. Known cases: function bodies get
`global x` only for variables the function assigns (not every program
variable); counter changes are emitted as `x += n`. When reading Python,
`global` statements produce no block.

### Synchronisation
- Blocks edited → Python is regenerated immediately (formatting normalised).
- Python edited → 0.5 s after typing stops, if it parses, the blocks are
  rebuilt. The Python text is not rewritten while the student types.
  Pressing Run during that 0.5 s applies the pending change first.
- Python with a syntax error → red underline and translated message on that
  line; blocks keep their last good state; **Run is disabled** until fixed.
- **What runs is always the Python text.**
- While a program is running, both editors are read-only.
- Round-trip guarantee: for every supported program, blocks → Python → blocks
  gives the same blocks, and Python → blocks → Python is stable after the
  first normalisation.

### Errors at runtime
The program stops; the failing block and Python line are highlighted. Common
errors get a translated, child-friendly explanation (`NameError`,
`TypeError`, `ValueError`, `ZeroDivisionError`, `IndexError`, wrong-slot
errors); other errors show Python's original English text.

## 6. Running

### Controls
- **▶ Run**: put the robot at the track start, start the program.
- **■ Stop**: halt the program; the robot stays where it is.
- **↺ Reset**: put the robot back at the start.
- **Track menu**: switching tracks stops any run and puts the robot at the
  new track's start.
- When the program ends, both motors stop.

### Execution model
- The simulation advances in fixed steps of 1/60 s, paced to real time.
- In each step the program runs until it gives a command — `motors`, `stop`,
  `wait`, or `print` — then pauses until the next step. Sensor reads don't
  pause. `wait(s)` pauses for `s` seconds of simulated time.
- Python that runs without giving any command (e.g. `while True: pass`) is
  interrupted after a few milliseconds and continues in the next step, so
  Stop always works and the tab never freezes.
- If the laptop can't keep up, the simulation slows down instead of skipping
  steps, so a run is identical on every machine.
- At each pause, the block and Python line that caused it are highlighted.

### Mat and tracks
Mat: 200 × 120 cm, white, 2 cm black line, scaled to fit its pane. Sensors
read the track geometry directly (not pixels), and the mat is drawn from the
same geometry, so what the student sees is what the sensors read — and the
result can't vary between graphics cards. The mat stays light in both themes.

1. **«Первые шаги»**: gentle curves, start box → green finish zone.
2. **«Шлагбаум»**: sharper curves and a barrier across the line. The barrier
   is closed until the robot's body has stayed within 25 cm of it for 3 s
   continuously; then it lifts and stays open for the rest of the run.
3. **«Цвета»**: line, barrier, and a 20 × 20 cm red square centred on a
   straight part of the line, then the green finish. The robot must stay
   motionless with its centre inside the red square for 2 s continuously
   before leaving it.

Each track defines a start position and heading. Every track must be
completable by a reference solution (see Testing).

### Rules checked by the simulator
| Event | Result |
|---|---|
| Robot centre enters the green zone | Success: robot stops, banner «Трасса пройдена! ⏱ 00:23.4» |
| Robot body touches the closed barrier | Fail: «Авария!» |
| Robot centre leaves the mat | Fail: «Робот уехал с поля» |
| Robot centre leaves the red square without the 2-second stop | Fail: «Не остановился на красном» |

Leaving the line is not a failure. There is no time limit.

### Live readings
- Next to the track: one row per installed sensor (slot, type, current
  value), a run timer, and the last 5 lines of `print` output.
- On the mat: line and colour sensor spots light up when they detect
  something; distance sensor beams are drawn up to their hit point.

## 7. Interface

- Header: working name «Робо-трасса», steps **1 Сборка** and **2 Программа**
  (switchable at any time), language switch **RU | ҚАЗ**, theme toggle ☀/🌙,
  «Новый проект» button (with confirmation; clears everything).
- Step 2 layout (option C in the mockup): left column — blocks (≈60 %) above
  the Python editor (≈40 %); right column — track controls, mat, readings.
- **Languages**: Russian by default; switching is instant and keeps all work.
  All visible text is translated (UI, block labels, slot and sensor names,
  track names, banners, errors). Python identifiers stay English. All texts
  live in one file per language.
- **Themes**: dark and light. Default follows the operating system; the
  toggle overrides it and is remembered. Applies to the UI, Blockly and
  CodeMirror; not to the mat.
- **Saving**: assembly, program, selected track, language and theme are saved
  automatically in the browser (localStorage). Nothing leaves the laptop.
- **New project**: no sensors, only the «при запуске» block, track 1 selected.
- **Screen**: designed for 1366×768 and up. Below ~1200 px wide, a message
  asks for a larger window.

## 8. Code structure

Each part has one job and can be tested on its own:
- **robot** — slots, sensor readings, kinematics (pure, no DOM).
- **tracks** — track data (line shape, zones, barrier, start pose) and the
  surface (brightness/colour) at any point.
- **sim** — world step and rules (pure, no DOM).
- **runner** — Skulpt wrapper: `robot` module, step pausing, Stop, current
  line tracking, error translation.
- **blocks** — block definitions, Python output customisations,
  Python → blocks converter.
- **ui** — header, assembly screen, program screen (Blockly, CodeMirror),
  track view, readings, themes.
- **i18n** (ru, kk) and **storage**.

## 9. Testing

- **Unit (Vitest)**: kinematics; sensor readings at known mat positions;
  track rules (finish, crash, off-mat, red square, barrier opening); converter
  round trips over a set of fixture programs covering every supported
  construct plus fallback cases; error translation.
- **End-to-end (Playwright, headless Chromium)**: for each of the three
  tracks — new project → place sensors → load a reference solution → Run →
  assert «Трасса пройдена!». Plus: Stop interrupts `while True: pass`;
  language and theme switches keep the program.
- **Performance**: with Chrome CPU throttling at 4×, the robot moves
  smoothly (no visible stutter); first load transfers ≤ 3 MB.
- **Manual**: after each UI change, the browser verification steps in
  `CLAUDE.md`.

## 10. Delivery

- GitHub Actions builds and deploys to GitHub Pages on every push to `main`.
- The repository owner must create the GitHub repository and enable Pages
  (not doable from this environment).

## 11. Open items for the owner

- Kazakh texts should be checked by a native speaker before the customer
  demo.
- «Робо-трасса» is a working name.
- Create the GitHub repository and enable Pages.
