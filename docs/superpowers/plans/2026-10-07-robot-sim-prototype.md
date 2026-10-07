# Robot Simulator Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, browser-based top-down robot simulator (assembly → blocks/Python → run on three tracks) good enough to record a 90-second customer demo.

**Architecture:** Pure, DOM-free core (geometry, robot, tracks, world rules, Skulpt-based program runner, blocks↔Python converter) tested in Node with Vitest; a thin vanilla-TypeScript UI (Blockly, CodeMirror 6, Canvas 2D) on top, tested end-to-end with Playwright. The simulation advances in fixed 1/60 s steps; the Python program pauses at every robot command, so runs are deterministic.

**Tech Stack:** Vite, TypeScript (strict), Blockly 13 + `@blockly/theme-dark`, CodeMirror 6 (`codemirror`, `@codemirror/lang-python`, `@codemirror/theme-one-dark`, `@codemirror/lint`), Skulpt 1.2.0 (vendored), Vitest, `@playwright/test@1.63.0`.

**Spec:** `docs/superpowers/specs/2026-10-07-robot-sim-prototype-design.md`

## Global Constraints

- Frontend only, static build; `vite.config.ts` uses `base: './'`.
- Chrome on a 1366×768 laptop is the target; below 1200 px width show the "window too small" message.
- UI languages: Russian (`ru`, default) and Kazakh (`kk`, Cyrillic). Every visible string comes from `src/i18n/`; Python identifiers and slot names stay English.
- Units: centimetres, seconds, radians. World axes: x right, y down (canvas convention); heading 0 = +x; a positive heading change turns clockwise on screen.
- Mat 200 × 120 cm; line width 2 cm; robot 15 wide × 18 long, wheels 16 cm apart, speed 100 = 30 cm/s.
- Simulation step `DT = 1/60` s; at most 4 steps per animation frame (slow down rather than skip).
- No random noise anywhere; the same program gives the same run.
- Skulpt 1.2.0 is the only Python execution path and the Python parser. It is vendored at `public/vendor/skulpt/` and loaded with classic `<script>` tags; there is no other interpreter.
- Names (variables, functions, parameters) must match `^[A-Za-z_][A-Za-z0-9_]*$` and must not be Python keywords.
- First load ≤ 3 MB gzipped in total.
- Playwright: headless only (`CLAUDE.md`); `@playwright/test` pinned to exactly `1.63.0` (matches the preinstalled Chromium revision 1243 at `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`; never run `playwright install` locally).
- Every commit: author `wisp <forworkandtravel@yandex.ru>` (use `git -c user.name=wisp -c user.email=forworkandtravel@yandex.ru commit …`), message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- After any UI task: the browser verification steps in `CLAUDE.md` (MCP navigate → snapshot → exercise → console errors empty → screenshot into `.playwright-mcp/` for visual changes → close).

## Review Focus

1. **Cyrillic names** — a child names a variable `скорость` in the block dialog or types it in Python: the dialog refuses with «Имя может содержать только латинские буквы, цифры и _»; Python shows the same hint on that line and Run stays disabled. (Tests: Task 9 `nonLatinName`, Task 13 e2e `cyrillic variable`.)
2. **Run pressed within 0.5 s of typing** — the run must use the just-typed Python, not the previous version. (Test: Task 14 e2e `run applies pending edit`.)
3. **Language switch during a run** — Blockly is re-created for the new locale; the run continues, highlighting keeps working, and nothing is lost. (Test: Task 14 e2e `language switch during run`.)
4. **Broken or unavailable storage** — corrupt JSON, an old version, or `localStorage` throwing: the app starts with a new project and doesn't crash. (Test: Task 11 `storage` unit tests.)
5. **Pasted code with Windows line endings or tab indentation** — it converts to blocks and normalises to 4-space Python. (Test: Task 9 `crlf and tabs`.)

---

## File structure

```
index.html                     app shell; loads vendored Skulpt then src/main.ts
public/vendor/skulpt/          skulpt.min.js, skulpt-stdlib.js, LICENSE (vendored 1.2.0)
src/main.ts                    bootstraps the UI
src/styles.css                 layout + theme tokens
src/geometry.ts                Point/Rect/Segment math
src/robot/robot.ts             robot constants, slots, pose maths, kinematics
src/tracks/tracks.ts           three track definitions + MAT
src/tracks/surface.ts          brightness/colour at a point
src/sim/world.ts               world state, stepping, rules
src/sim/sensors.ts             sensor reads + SensorError + readAll
src/sim/session.ts             Program + World glued together per run
src/runner/sk.ts               access to global Sk + configure
src/runner/program.ts          Program: runs Python in lock-step
src/runner/errors.ts           ProgramError + conversion from Skulpt exceptions
src/i18n/{index,ru,kk,blocklyKeys}.ts   dictionaries, t(), error formatting
src/blocks/definitions.ts      custom blocks + Python generator overrides
src/blocks/locale.ts           applies Blockly messages for a language
src/blocks/toolbox.ts          toolbox definition
src/blocks/names.ts            name validation (+ Blockly dialog hook)
src/blocks/toPython.ts         blocks → Python (+ line→block map)
src/blocks/fromPython.ts       Python → blocks JSON (+ line→block map)
src/blocks/comments.ts         string-aware comment scanner
src/blocks/fixtures/*.py       canonical round-trip programs
src/ui/state.ts                app state store + persistence wiring
src/storage.ts                 localStorage load/save
src/ui/{header,theme,assembly,blocksPane,pythonEditor,sync,programScreen,trackView,readings,runLoop}.ts
tests/solutions/{first_steps,barrier,colors}.py, tests/solutions/reference.ts
e2e/*.spec.ts                  Playwright tests
scripts/check-size.mjs         gzip size budget
.github/workflows/deploy.yml   CI build + Pages deploy
```

---

### Task 1: Project scaffold, vendored Skulpt, test harnesses

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/styles.css`, `src/runner/sk.ts`, `src/test/setupSkulpt.ts`, `src/runner/sk.test.ts`, `public/vendor/skulpt/{skulpt.min.js,skulpt-stdlib.js,LICENSE}`
- Modify: `.gitignore` (add `node_modules/`, `dist/`, `test-results/`, `playwright-report/`, `.playwright-mcp/`)

**Interfaces:**
- Produces: `sk(): any` (returns `globalThis.Sk`); `configureSkulpt(opts: { output: (s: string) => void; yieldLimit?: number }): void` — sets `__future__: Sk.python3`, a `read` that serves `Sk.builtinFiles.files[path]` and returns `''` for any path whose basename is `robot.py` (so `from robot import *` imports an empty module), throws `"File not found: '<path>'"` otherwise.
- Produces scripts: `dev`, `build` (`tsc --noEmit && vite build`), `preview`, `test` (`vitest run`), `e2e` (`playwright test`), `size` (`node scripts/check-size.mjs`, added in Task 15).

- [ ] **Step 1: Scaffold.** `npm init`, then install the dependencies (`vite typescript vitest @playwright/test@1.63.0` dev; `blockly @blockly/theme-dark codemirror @codemirror/lang-python @codemirror/theme-one-dark @codemirror/lint` runtime). `npm i skulpt@1.2.0 --no-save` once, then copy its `dist/skulpt.min.js`, `dist/skulpt-stdlib.js` and `LICENSE` into `public/vendor/skulpt/`. `index.html` loads both with `<script src="./vendor/skulpt/…">` before `<script type="module" src="/src/main.ts">`. `vite.config.ts`: `base: './'`, Vitest `test.setupFiles: ['src/test/setupSkulpt.ts']`, `test.include: ['src/**/*.test.ts']`. `setupSkulpt.ts` loads both vendored files with `createRequire(import.meta.url)`.

- [ ] **Step 2: Write the failing test** `src/runner/sk.test.ts`

```ts
test('runs python and imports the empty robot module', async () => {
  const out: string[] = [];
  configureSkulpt({ output: s => out.push(s) });
  await sk().misceval.asyncToPromise(() =>
    sk().importMainWithBody('<stdin>', false, 'from robot import *\nimport math\nprint(1 + 1)\n', true));
  expect(out.join('')).toBe('2\n');
});
```

- [ ] **Step 3: Run** `npm test` — Expected: FAIL (`configureSkulpt` not defined).
- [ ] **Step 4: Implement** `src/runner/sk.ts`.
- [ ] **Step 5: Run** `npm test` → PASS; `npm run build` → succeeds; `npm run dev` → `http://localhost:5173` returns 200.
- [ ] **Step 6: Commit** `chore: scaffold Vite + TS project with vendored Skulpt`

---

### Task 2: Geometry and robot model

**Files:**
- Create: `src/geometry.ts`, `src/robot/robot.ts`, `src/geometry.test.ts`, `src/robot/robot.test.ts`

**Interfaces:**
- Produces (`geometry.ts`):
  - `interface Point { x: number; y: number }`, `interface Rect { x: number; y: number; w: number; h: number }`, `interface Segment { a: Point; b: Point }`
  - `distanceToSegment(p: Point, s: Segment): number`
  - `distanceToPolyline(p: Point, line: Point[]): number`
  - `rectContains(r: Rect, p: Point): boolean` (edges inclusive)
  - `rayToSegment(origin: Point, angle: number, s: Segment): number | null` — distance along the ray to the hit, or `null`
  - `polygonToSegment(poly: Point[], s: Segment): number` — 0 when they intersect
  - `smoothPath(points: Point[], samplesPerSegment: number): Point[]` — Catmull-Rom through every point (end tangents use the duplicated end point); returns `(points.length − 1) · samplesPerSegment + 1` points; the first and last points are kept exactly
- Produces (`robot/robot.ts`):
  - `ROBOT = { width: 15, length: 18, wheelBase: 16, maxSpeed: 30 } as const`
  - `type SlotName = 'front_left' | 'front_center' | 'front_right' | 'left' | 'right'`; `SLOT_NAMES: readonly SlotName[]` in that order
  - `type SensorType = 'line' | 'distance' | 'color'`; `type Assembly = Partial<Record<SlotName, SensorType>>`
  - `SLOTS: Record<SlotName, { forward: number; left: number; facing: number }>`: `front_left {9, 2.5, 0}`, `front_center {9, 0, 0}`, `front_right {9, -2.5, 0}`, `left {4, 7.5, -Math.PI/2}`, `right {4, -7.5, Math.PI/2}`
  - `interface Pose { x: number; y: number; heading: number }`
  - `toWorld(pose: Pose, forward: number, left: number): Point` = `(x + f·cos h + l·sin h, y + f·sin h − l·cos h)`
  - `slotPoint(pose, slot): Point`, `slotDirection(pose, slot): number` (= heading + facing)
  - `bodyCorners(pose): Point[]` (4 corners, ±9 forward, ±7.5 left)
  - `stepPose(pose: Pose, left: number, right: number, dt: number): Pose` — speeds −100…100; `vl,vr = speed/100·30`; `v = (vl+vr)/2`; `ω = (vr−vl)/16`; heading decreases by `ω·dt` (right wheel faster ⇒ turns left ⇒ counter-clockwise on screen); integrate position with the midpoint heading

- [ ] **Step 1: Write failing tests**

```ts
// geometry.test.ts
test('distanceToSegment', () => expect(distanceToSegment({x:5,y:3},{a:{x:0,y:0},b:{x:10,y:0}})).toBe(3));
test('rayToSegment hit and miss', () => {
  const s = {a:{x:10,y:-5}, b:{x:10,y:5}};
  expect(rayToSegment({x:0,y:0}, 0, s)).toBeCloseTo(10);
  expect(rayToSegment({x:0,y:0}, Math.PI, s)).toBeNull();
});
test('polygonToSegment is 0 when crossing', () => {
  const sq = [{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}];
  expect(polygonToSegment(sq, {a:{x:2,y:-1},b:{x:2,y:5}})).toBe(0);
  expect(polygonToSegment(sq, {a:{x:7,y:0},b:{x:7,y:4}})).toBeCloseTo(3);
});
test('smoothPath keeps endpoints', () => {
  const p = smoothPath([{x:0,y:0},{x:10,y:5},{x:20,y:0}], 8);
  expect(p[0]).toEqual({x:0,y:0}); expect(p.at(-1)).toEqual({x:20,y:0}); expect(p.length).toBe(17);
});
// robot.test.ts
test('straight 1 s at 100', () => expect(stepPose({x:0,y:0,heading:0},100,100,1)).toEqual({x:30,y:0,heading:0}));
test('spin in place', () => {
  const p = stepPose({x:0,y:0,heading:0},-50,50,1);
  expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(0); expect(p.heading).toBeCloseTo(-1.875);
});
test('right wheel faster turns left (up the screen)', () => {
  let p = {x:0,y:0,heading:0}; for (let i=0;i<60;i++) p = stepPose(p,0,50,1/60);
  expect(p.heading).toBeLessThan(0); expect(p.y).toBeLessThan(0);
});
test('slot positions', () => {
  expect(slotPoint({x:100,y:50,heading:0},'front_left')).toEqual({x:109,y:47.5});
  expect(slotPoint({x:100,y:50,heading:0},'right')).toEqual({x:104,y:57.5});
  const p = slotPoint({x:100,y:50,heading:Math.PI/2},'front_left');
  expect(p.x).toBeCloseTo(102.5); expect(p.y).toBeCloseTo(59);
  expect(slotDirection({x:0,y:0,heading:0},'left')).toBeCloseTo(-Math.PI/2);
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: geometry and robot kinematics`

---

### Task 3: Tracks and mat surface

**Files:**
- Create: `src/tracks/tracks.ts`, `src/tracks/surface.ts`, `src/tracks/surface.test.ts`

**Interfaces:**
- Consumes: `Point, Rect, Segment, smoothPath, distanceToPolyline, rectContains` (Task 2); `Pose`.
- Produces:
  - `MAT = { width: 200, height: 120, lineWidth: 2 } as const`
  - `type TrackId = 'first_steps' | 'barrier' | 'colors'`
  - `interface Track { id: TrackId; line: Point[]; start: Pose; startBox: Rect; finish: Rect; barrier?: Segment; redSquare?: Rect }` (`line` is already smoothed with 12 samples per segment)
  - `TRACKS: readonly Track[]` (menu order as above); `getTrack(id: TrackId): Track`
  - `type ColorName = 'black' | 'white' | 'red' | 'green'`
  - `BRIGHTNESS: Record<ColorName, number> = { black: 10, white: 95, red: 55, green: 60 }`
  - `surfaceAt(track: Track, p: Point): { brightness: number; color: ColorName }`

Starting track data (control points before smoothing). Task 6 may move control points — but not sizes, zones' sizes or rules — until the reference solutions pass:

| Track | Control points | start / startBox | finish | extra |
|---|---|---|---|---|
| `first_steps` | (15,95) (45,95) (75,85) (100,60) (125,45) (155,50) (185,60) | {25,95,0} / {14,84,22,22} | {170,48,24,24} | — |
| `barrier` | (15,25) (55,25) (80,40) (80,65) (60,85) (75,100) (110,100) (150,100) (185,100) | {25,25,0} / {14,14,22,22} | {170,88,24,24} | barrier (135,90)–(135,110) |
| `colors` | (15,100) (50,100) (72,88) (80,62) (92,38) (112,24) (130,24) (150,24) (168,38) (178,62) (182,90) | {25,100,0} / {14,89,22,22} | {170,86,24,24} | redSquare {121,14,20,20}; barrier (168,70)–(192,70) |

`surfaceAt` algorithm: off the mat → `{0, 'black'}`; inside `redSquare` → red; inside `finish` → green (zones are painted over the line); otherwise `d = distanceToPolyline`, coverage `c = clamp((1.25 − d) / 0.5, 0, 1)`, `brightness = round(95 − 85·c)`, `color = c ≥ 0.5 ? 'black' : 'white'`.

- [ ] **Step 1: Write failing tests** (`surface.test.ts`, using `getTrack('colors')`)

```ts
const t = getTrack('colors');
test('on the line centre', () => expect(surfaceAt(t, t.line[5])).toEqual({ brightness: 10, color: 'black' }));
test('far from line', () => expect(surfaceAt(t, { x: 100, y: 110 })).toEqual({ brightness: 95, color: 'white' }));
test('line edge is in between', () => {
  const p = t.line[0]; // line starts heading +x at y=100
  expect(surfaceAt(t, { x: p.x + 3, y: p.y + 1.0 }).brightness).toBe(53);
});
test('red square hides the line', () => expect(surfaceAt(t, { x: 131, y: 24 })).toEqual({ brightness: 55, color: 'red' }));
test('finish is green', () => expect(surfaceAt(t, { x: 182, y: 100 })).toEqual({ brightness: 60, color: 'green' }));
test('every track starts inside its start box and the mat', () => {
  for (const tr of TRACKS) { expect(rectContains(tr.startBox, tr.start)).toBe(true);
    for (const p of tr.line) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(200);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(120); } }
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: three tracks and mat surface model`

---

### Task 4: World — sensors and rules

**Files:**
- Create: `src/sim/world.ts`, `src/sim/sensors.ts`, `src/sim/world.test.ts`, `src/sim/sensors.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces (`world.ts`):
  - `DT = 1 / 60`
  - `type Outcome = 'running' | 'success' | 'crash' | 'offField' | 'missedRed'`
  - `interface World { track: Track; assembly: Assembly; pose: Pose; motors: { left: number; right: number }; time: number; barrierOpen: boolean; barrierNearTime: number; red: { inside: boolean; stillTime: number; done: boolean }; outcome: Outcome }`
  - `createWorld(track: Track, assembly: Assembly): World` (pose = `track.start`, barrier closed)
  - `setMotors(w: World, left: number, right: number): void` — clamps to −100…100
  - `stepWorld(w: World): void` — no-op unless `outcome === 'running'`. Order: move by `stepPose(…, DT)`; `time += DT`; **crash** if the barrier is closed and `polygonToSegment(bodyCorners, barrier) ≤ 1`; **barrier timer**: while closed, if that distance ≤ 25 then `barrierNearTime += DT`, else reset to 0; opens when ≥ 3; **red**: `inside = rectContains(redSquare, centre)`; inside with both motors 0 → `stillTime += DT`; inside and moving → `stillTime = 0`; `stillTime ≥ 2` → `done`; leaving (was inside, now not) without `done` → `missedRed`; **off field**: centre outside 0…200 × 0…120 → `offField`; **finish**: centre in `finish` → `success`. Any non-running outcome sets the motors to 0. Time thresholds (3 s, 2 s) compare with a `1e-9` tolerance.
- Produces (`sensors.ts`):
  - `type SensorFunction = 'line' | 'brightness' | 'distance' | 'color'`
  - `class SensorError extends Error { constructor(readonly slot: string, readonly needed: SensorType | null) }` (`needed === null` ⇒ unknown slot name)
  - `DISTANCE_MAX = 100`
  - `readSensor(w: World, fn: SensorFunction, slot: string): boolean | number | ColorName` — `line`/`brightness` need a line sensor, `distance` a distance sensor, `color` a colour sensor; `line` = brightness < 50; `distance` = `min(100, round(rayToSegment(slotPoint, slotDirection, barrier)))` when the barrier is closed and hit, else 100
  - `interface Reading { slot: SlotName; type: SensorType; line?: boolean; brightness?: number; distance?: number; color?: ColorName }`
  - `readAll(w: World): Reading[]` — installed sensors in `SLOT_NAMES` order

- [ ] **Step 1: Write failing tests**

```ts
// sensors.test.ts
const asm = { front_left: 'line', front_center: 'distance', right: 'color' } as const;
test('wrong sensor type', () => {
  const w = createWorld(getTrack('first_steps'), asm);
  expect(() => readSensor(w, 'line', 'right')).toThrowError(SensorError);
  try { readSensor(w, 'line', 'right'); } catch (e) { expect((e as SensorError).needed).toBe('line'); }
});
test('unknown slot', () => {
  try { readSensor(createWorld(getTrack('first_steps'), asm), 'distance', 'front'); } catch (e) { expect((e as SensorError).needed).toBeNull(); }
});
test('distance sees closed barrier only', () => {
  const w = createWorld(getTrack('barrier'), asm);
  w.pose = { x: 110, y: 100, heading: 0 };              // front slot at x=119, barrier at x=135
  expect(readSensor(w, 'distance', 'front_center')).toBe(16);
  w.barrierOpen = true;
  expect(readSensor(w, 'distance', 'front_center')).toBe(100);
});
test('readAll order', () => expect(readAll(createWorld(getTrack('first_steps'), asm)).map(r => r.slot)).toEqual(['front_left','front_center','right']));
// world.test.ts
test('barrier opens after 3 s within 25 cm', () => {
  const w = createWorld(getTrack('barrier'), {}); w.pose = { x: 115, y: 100, heading: 0 };
  for (let i = 0; i < 179; i++) stepWorld(w); expect(w.barrierOpen).toBe(false);
  stepWorld(w); expect(w.barrierOpen).toBe(true);
});
test('touching closed barrier crashes', () => {
  const w = createWorld(getTrack('barrier'), {}); w.pose = { x: 120, y: 100, heading: 0 }; setMotors(w, 100, 100);
  for (let i = 0; i < 120 && w.outcome === 'running'; i++) stepWorld(w);
  expect(w.outcome).toBe('crash'); expect(w.motors).toEqual({ left: 0, right: 0 });
});
test('red square: 2 s still then leave is fine; leaving early fails', () => {
  const ok = createWorld(getTrack('colors'), {}); ok.pose = { x: 131, y: 24, heading: 0 };
  for (let i = 0; i < 120; i++) stepWorld(ok); setMotors(ok, 100, 100);
  for (let i = 0; i < 60; i++) stepWorld(ok); expect(ok.outcome).toBe('running'); expect(ok.red.done).toBe(true);
  const bad = createWorld(getTrack('colors'), {}); bad.pose = { x: 131, y: 24, heading: 0 }; setMotors(bad, 100, 100);
  for (let i = 0; i < 60; i++) stepWorld(bad); expect(bad.outcome).toBe('missedRed');
});
test('off field and finish', () => {
  const off = createWorld(getTrack('first_steps'), {}); off.pose = { x: 199, y: 10, heading: 0 }; setMotors(off, 100, 100);
  for (let i = 0; i < 30; i++) stepWorld(off); expect(off.outcome).toBe('offField');
  const fin = createWorld(getTrack('first_steps'), {}); fin.pose = { x: 165, y: 60, heading: 0 }; setMotors(fin, 100, 100);
  for (let i = 0; i < 30; i++) stepWorld(fin); expect(fin.outcome).toBe('success');
});
test('motors clamp', () => { const w = createWorld(getTrack('first_steps'), {}); setMotors(w, 500, -500); expect(w.motors).toEqual({ left: 100, right: -100 }); });
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: world stepping, sensors and track rules`

---

### Task 5: Python program runner

**Files:**
- Create: `src/runner/errors.ts`, `src/runner/program.ts`, `src/runner/program.test.ts`, `src/runner/errors.test.ts`

**Interfaces:**
- Consumes: `sk`, `configureSkulpt` (Task 1); `SensorFunction`, `SensorError`, `SensorType` (Task 4).
- Produces (`errors.ts`):
  - `type ErrorKind = 'SyntaxError' | 'IndentationError' | 'NonLatinName' | 'NameError' | 'TypeError' | 'ValueError' | 'ZeroDivisionError' | 'IndexError' | 'SensorError' | 'Other'`
  - `interface ProgramError { kind: ErrorKind; line: number | null; message: string; name?: string; slot?: string; needed?: SensorType | null }` — `message` is Python's original English text; `name` is the missing name for `NameError`
  - `toProgramError(e: unknown, source: string, sensorError: SensorError | null): ProgramError` — reads `e.tp$name`, `e.traceback[0].lineno`, `e.args.v[0].v`; a `SyntaxError` whose line contains a non-ASCII letter outside strings and comments becomes `NonLatinName`
- Produces (`program.ts`):
  - `interface RobotIO { setMotors(left: number, right: number): void; read(fn: SensorFunction, slot: string): boolean | number | string; print(text: string): void }`
  - `type ProgramState = 'idle' | 'running' | 'finished' | 'error' | 'stopped'`
  - `class Program { constructor(source: string, io: RobotIO); advance(dt: number): Promise<void>; stop(): void; readonly state: ProgramState; readonly line: number | null; readonly error: ProgramError | null }`
  - Python built-ins it installs on `Sk.builtins` (one running Program at a time): `motors(l, r)` (numbers, else `TypeError`), `stop()`, `wait(s)` (number ≥ 0, else `ValueError`), `print(*args)` (`str()` of each argument, joined by spaces), `line/brightness/distance/color(slot)` (return a Python bool/int/str immediately). `motors`, `stop`, `wait` and `print` end the current step.
  - `YIELD_MS = 4` (Skulpt `yieldLimit`)

Lock-step algorithm (the part the tests don't fully dictate):
```
advance(dt):
  idle    → state = running; start Sk.misceval.asyncToPromise(importMainWithBody('<stdin>', …), handlers); await nextPause
  running → if waitLeft > 0: waitLeft -= dt; if waitLeft > 1e-9 return
            resolve the pending gate promise; await nextPause
  other   → return
step-ending command: do its effect, create a new gate promise, resolve nextPause, return Sk.misceval.promiseToSuspension(gate)
handlers '*': record line = deepest suspension in the .child chain whose $filename contains '<stdin>' ($lineno);
              if stopping, throw a private StopSignal; for 'Sk.yield' return gate.then(() => susp.resume()) after resolving nextPause; else return null
program promise settles → finished / stopped (StopSignal) / error (toProgramError); resolve nextPause
stop(): set the stopping flag; resolve the gate so Python reaches its next suspension and is halted there; commands check the flag first and have no effect once it is set
```

- [ ] **Step 1: Write failing tests** (`program.test.ts`; a fake `io` records calls; `const run = async (p, n) => { for (let i = 0; i < n; i++) await p.advance(1/60); }`)

```ts
test('one loop iteration per step', async () => {
  const io = fakeIO(); const p = new Program('while True:\n    motors(10, 20)\n', io);
  await run(p, 5); expect(io.motorCalls.length).toBe(5); expect(p.line).toBe(2);
});
test('wait pauses for simulated time', async () => {
  const io = fakeIO(); const p = new Program('motors(1, 1)\nwait(0.5)\nmotors(2, 2)\n', io);
  await run(p, 31); expect(io.motorCalls.at(-1)).toEqual([1, 1]);
  await run(p, 1); expect(io.motorCalls.at(-1)).toEqual([2, 2]);
  await run(p, 1); expect(p.state).toBe('finished');
});
test('sensor reads do not pause', async () => {
  const io = fakeIO({ line: true }); const p = new Program('a = line("front_left")\nb = line("front_left")\nprint(a, b)\n', io);
  await run(p, 1); expect(io.printed).toEqual(['True True']);
});
test('stop interrupts an empty infinite loop', async () => {
  const p = new Program('while True:\n    pass\n', fakeIO());
  await run(p, 2); p.stop(); await run(p, 1); expect(p.state).toBe('stopped');
});
test('runtime errors carry kind, line and name', async () => {
  const p = new Program('x = 1\nmotor(1, 2)\n', fakeIO()); await run(p, 1);
  expect(p.state).toBe('error'); expect(p.error).toMatchObject({ kind: 'NameError', line: 2, name: 'motor' });
});
test('sensor error', async () => {
  const io = fakeIO({ throwOn: 'left' }); const p = new Program('line("left")\n', io); await run(p, 1);
  expect(p.error).toMatchObject({ kind: 'SensorError', line: 1, slot: 'left', needed: 'line' });
});
test('bad arguments', async () => {
  const p1 = new Program('motors("fast", 1)\n', fakeIO()); await run(p1, 1); expect(p1.error?.kind).toBe('TypeError');
  const p2 = new Program('wait(-1)\n', fakeIO()); await run(p2, 1); expect(p2.error?.kind).toBe('ValueError');
});
test('highlight line inside a function', async () => {
  const p = new Program('def go():\n    motors(1, 1)\n\nwhile True:\n    go()\n', fakeIO()); await run(p, 1); expect(p.line).toBe(2);
});
// errors.test.ts
test('cyrillic name is NonLatinName', async () => {
  const p = new Program('скорость = 5\n', fakeIO()); await run(p, 1); expect(p.error).toMatchObject({ kind: 'NonLatinName', line: 1 });
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `errors.ts`, then `program.ts`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: lock-step Python runner on Skulpt`

---

### Task 6: Session and reference solutions — every track is completable

**Files:**
- Create: `src/sim/session.ts`, `src/sim/session.test.ts`, `tests/solutions/first_steps.py`, `tests/solutions/barrier.py`, `tests/solutions/colors.py`, `tests/solutions/reference.ts`
- Modify (only if needed to pass): control points in `src/tracks/tracks.ts`

**Interfaces:**
- Consumes: `Program`, `RobotIO` (Task 5); world, sensors (Task 4).
- Produces:
  - `type RunOutcome = Outcome | 'programEnded' | 'programError' | 'stopped'`
  - `class Session { constructor(track: Track, assembly: Assembly, source: string); readonly world: World; readonly program: Program; readonly output: string[] /* last 5 printed lines */; get outcome(): RunOutcome; step(): Promise<void>; stop(): void }`
  - `step()` = `program.advance(DT)` then `stepWorld(world)`. When the world outcome stops being `running`, the program is stopped. When the program finishes, the motors go to 0 and the outcome is `programEnded`. A program error gives `programError`. `stop()` gives `stopped`. Once the outcome isn't `running`, `step()` does nothing.
  - `tests/solutions/reference.ts`: `REFERENCE_ASSEMBLY: Assembly = { front_left: 'line', front_right: 'line', front_center: 'distance', right: 'color' }`; `readSolution(id: TrackId): string` (reads the `.py` file with `fs`; e2e tests import the same helper)

`first_steps.py`:
```python
from robot import *

while True:
    if line("front_left"):
        motors(0, 50)
    elif line("front_right"):
        motors(50, 0)
    else:
        motors(50, 50)
```
`barrier.py`: the same, with a first branch `if distance("front_center") < 15:` → `stop()` (the line branches become `elif`).
`colors.py`:
```python
from robot import *

red_done = False
while True:
    if not red_done and color("right") == "red":
        motors(50, 50)
        wait(0.6)
        stop()
        wait(2.5)
        red_done = True
    elif distance("front_center") < 15:
        stop()
    elif line("front_left"):
        motors(0, 50)
    elif line("front_right"):
        motors(50, 0)
    else:
        motors(50, 50)
```

- [ ] **Step 1: Write failing tests** (`session.test.ts`; helper `runToEnd(s, maxSeconds = 180)` steps until `outcome !== 'running'` or the time runs out)

```ts
for (const id of ['first_steps', 'barrier', 'colors'] as const)
  test(`reference solution completes ${id}`, async () => {
    const s = new Session(getTrack(id), REFERENCE_ASSEMBLY, readSolution(id));
    await runToEnd(s); expect(s.outcome).toBe('success');
  });
test('ignoring the barrier crashes', async () => {
  const s = new Session(getTrack('barrier'), REFERENCE_ASSEMBLY, readSolution('first_steps')); await runToEnd(s); expect(s.outcome).toBe('crash');
});
test('skipping the red stop fails', async () => {
  const s = new Session(getTrack('colors'), REFERENCE_ASSEMBLY, readSolution('barrier')); await runToEnd(s); expect(s.outcome).toBe('missedRed');
});
test('driving straight leaves the field', async () => {
  const s = new Session(getTrack('first_steps'), {}, 'while True:\n    motors(50, 50)\n'); await runToEnd(s); expect(s.outcome).toBe('offField');
});
test('program end stops motors', async () => {
  const s = new Session(getTrack('first_steps'), {}, 'motors(50, 50)\nwait(1)\n'); await runToEnd(s);
  expect(s.outcome).toBe('programEnded'); expect(s.world.motors).toEqual({ left: 0, right: 0 });
});
test('output keeps last 5 lines', async () => {
  const s = new Session(getTrack('first_steps'), {}, 'for i in range(8):\n    print(i)\n'); await runToEnd(s);
  expect(s.output).toEqual(['3', '4', '5', '6', '7']);
});
test('identical runs', async () => {
  const a = new Session(getTrack('colors'), REFERENCE_ASSEMBLY, readSolution('colors')); await runToEnd(a);
  const b = new Session(getTrack('colors'), REFERENCE_ASSEMBLY, readSolution('colors')); await runToEnd(b);
  expect(a.world.time).toBe(b.world.time); expect(a.world.pose).toEqual(b.world.pose);
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `session.ts` and the solution files.
- [ ] **Step 4: Run** `npm test`. If a reference solution fails because of track shape (too sharp a curve, a barrier on a bend), adjust only that track's control points and rerun until all of them pass. If it fails for any other reason, fix the code, not the track.
- [ ] **Step 5: Commit** `feat: run session; reference solutions complete all tracks`

---

### Task 7: i18n and error messages

**Files:**
- Create: `src/i18n/ru.ts`, `src/i18n/kk.ts`, `src/i18n/blocklyKeys.ts`, `src/i18n/index.ts`, `src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: `ProgramError` (Task 5); `SlotName`, `SensorType` (Task 2); `TrackId`, `ColorName` (Task 3).
- Produces:
  - `ru = { ui: {...}, blocks: {...} } as const`; `type Dict = { ui: Record<keyof typeof ru.ui, string>; blocks: Record<keyof typeof ru.blocks, string>; blocklyBuiltins: Record<BlocklyBuiltinKey, string> }`; `kk: Dict` (TypeScript enforces that Kazakh has every key). `ru.blocklyBuiltins` comes from Blockly's own `blockly/msg/ru`.
  - `blocklyKeys.ts`: `BLOCKLY_BUILTIN_KEYS` — every Blockly message key visible with our toolbox: the built-in blocks used in Task 8, context-menu items, and variable/procedure dialogs. `type BlocklyBuiltinKey = typeof BLOCKLY_BUILTIN_KEYS[number]`.
  - `type Lang = 'ru' | 'kk'`; `getLang()`, `setLang(l)`, `onLangChange(cb): () => void`
  - `t(key: keyof typeof ru.ui, params?: Record<string, string | number>): string` — `{name}` placeholders
  - `slotLabel(s: SlotName)`, `sensorLabel(t: SensorType)`, `trackName(id: TrackId)`, `colorLabel(c: ColorName)`
  - `formatProgramError(e: ProgramError): string` — prefixed «Строка {line}: » when the line is known
- `ui` key names used by other tasks: `trackComplete`, `crash`, `offField`, `missedRed`, `sensorMissing`, `unknownSlot`, `nameNotFound`, `nameLatinOnly`, `programEnded`, `confirmNewProject`, `lineN`.
- Exact Russian copy fixed by the spec:
  - success banner `Трасса пройдена! ⏱ {time}` (time as `mm:ss.s`)
  - `Авария!`, `Робот уехал с поля`, `Не остановился на красном`
  - `В слоте «{slot}» нет датчика {sensorGen}` (genitive: линии / расстояния / цвета); unknown slot: `Слота «{slot}» нет. Есть: front_left, front_center, front_right, left, right`
  - `Имя «{name}» не найдено — может быть, опечатка?`
  - `Имя может содержать только латинские буквы, цифры и _`
  - steps `1 Сборка`, `2 Программа`; `Далее: программа →`; `▶ Запуск`, `■ Стоп`, `↺ Сброс`; `Новый проект` (confirmation: `Начать новый проект? Сборка и программа будут удалены.`)
  - `при запуске`; `Программа завершена`; slot labels `перед-лево`, `перед-центр`, `перед-право`, `лево`, `право`
  - track names `Первые шаги`, `Шлагбаум`, `Цвета`; `Python-код`
- Errors not listed above: `TypeError`, `ValueError`, `ZeroDivisionError` and `IndexError` get one short child-friendly sentence each; `Other` shows the English `message`.

- [ ] **Step 1: Write failing tests**

```ts
test('placeholders', () => { setLang('ru'); expect(t('nameNotFound', { name: 'motor' })).toBe('Имя «motor» не найдено — может быть, опечатка?'); });
test('sensor error message', () => { setLang('ru');
  expect(formatProgramError({ kind: 'SensorError', line: 3, message: '', slot: 'left', needed: 'line' })).toBe('Строка 3: В слоте «лево» нет датчика линии'); });
test('other errors keep English text', () => { setLang('ru');
  expect(formatProgramError({ kind: 'Other', line: null, message: 'KeyError: x' })).toBe('KeyError: x'); });
test('kk has no empty strings', () => { for (const v of Object.values(kk.ui)) expect(v.trim()).not.toBe(''); });
test('language change notifies', () => { const f = vi.fn(); const off = onLangChange(f); setLang('kk'); expect(f).toHaveBeenCalled(); off(); setLang('ru'); });
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement**, writing the Kazakh translations yourself, with a comment at the top of `kk.ts`: `// Needs review by a native Kazakh speaker before the customer demo.`
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` → PASS (the type check proves Kazakh is complete).
- [ ] **Step 5: Commit** `feat: Russian and Kazakh dictionaries, error formatting`

---

### Task 8: Blocks and blocks → Python

**Files:**
- Create: `src/blocks/definitions.ts`, `src/blocks/locale.ts`, `src/blocks/toolbox.ts`, `src/blocks/names.ts`, `src/blocks/toPython.ts`, `src/blocks/workspace.ts`, `src/blocks/toPython.test.ts`, `src/blocks/names.test.ts`

**Interfaces:**
- Consumes: i18n (Task 7); `SLOT_NAMES` (Task 2).
- Produces:
  - `registerBlocks(): void` (idempotent)
  - `applyBlocklyLocale(lang: Lang): void` — Blockly's `ru` messages as the base, then `kk.blocklyBuiltins` for Kazakh, then our block messages
  - `buildToolbox(): object` — categories: Робот, Датчики, Логика, Циклы, Числа, Переменные, Списки, Функции, Текст, Прочее (`python_code`, `comment_note`)
  - `isValidName(name: string): boolean` — the Global Constraints rule; `installNameValidation(): void` — wraps `Blockly.dialog.setPrompt` so an invalid name triggers `alert(t('nameLatinOnly'))` and asks again (`null` cancels), and adds a validator to the procedure-name and parameter fields that rejects invalid names
  - `createHeadlessWorkspace(): Blockly.Workspace` (`new Blockly.Workspace(new Blockly.Options({ oneBasedIndex: false }))`); the UI injects with `oneBasedIndex: false` too
  - `interface GeneratedPython { code: string; lineToBlock: Map<number, string> }`; `blocksToPython(ws: Blockly.Workspace): GeneratedPython`
  - Tests must call `registerBlocks()` and `applyBlocklyLocale('ru')` first (Blockly throws without messages).

**Block set — each block has exactly one Python form:**

| Block type | Python | Kind |
|---|---|---|
| `robot_start` (hat, undeletable, one per workspace) | its body is the main program | custom |
| `robot_motors` (L, R) / `robot_stop` / `robot_wait` (S) | `motors(L, R)` / `stop()` / `wait(S)` | custom |
| `robot_line` / `robot_brightness` / `robot_distance` / `robot_color` (field SLOT) | `line("front_left")` … | custom |
| `robot_color_value` (field COLOR) | `"red"` / `"green"` / `"black"` / `"white"` | custom |
| `controls_if` | `if` / `elif` / `else` | built-in |
| `logic_compare`, `logic_operation`, `logic_negate`, `logic_boolean` | `a == b` …, `a and b`, `not a`, `True` | built-in |
| `controls_forever` | `while True:` | custom |
| `controls_while` (COND) | `while COND:` | custom |
| `controls_repeat_ext` | `for _ in range(N):` | built-in, generator overridden |
| `py_for_range` (VAR, START, STOP, STEP) | `for i in range(STOP)` if START is literal 0 and STEP literal 1; `range(START, STOP)` if STEP literal 1; else all three | custom |
| `controls_forEach` | `for x in L:` | built-in |
| `controls_flow_statements` | `break` / `continue` | built-in |
| `math_number` | literal | built-in |
| `py_binop` (OP: `+ - * / // % **`) | `a OP b`, minimal parentheses via `Order` | custom |
| `py_neg` / `py_math_func` (FUNC: abs, round) | `-a` / `abs(a)`, `round(a)` | custom |
| `text` | double-quoted string, escaping `\\`, `"`, `\n` | built-in, generator overridden |
| `text_print` | `print(x)` | built-in |
| `variables_get`, `variables_set` | `x`, `x = v` | built-in |
| `var_change` (VAR, OP `+=`/`-=`, DELTA) | `x += v` | custom |
| `procedures_defnoreturn`, `procedures_defreturn`, `procedures_callnoreturn`, `procedures_callreturn` | `def f(a):` / `f(a)` | built-in, def generators overridden |
| `py_return` (optional VALUE) | `return` / `return v` | custom |
| `lists_create_with` | `[a, b]`, `[]` | built-in |
| `py_list_get` / `py_list_set` / `py_list_append` / `py_len` | `L[i]` / `L[i] = v` / `L.append(v)` / `len(L)` | custom |
| `python_code` (multiline field CODE) | its text, re-indented to the current level | custom |
| `comment_note` (field TEXT) | `# TEXT` | custom |

**Generator rules:**
- 4-space indent.
- Generate only the `robot_start` stack and procedure definitions; loose blocks produce nothing.
- No `x = None` variable declarations and no `from numbers import Number`.
- Output layout: `from robot import *` + blank line, then each function (in workspace order) followed by one blank line, then the main program, ending with a newline. With no functions and an empty main program, the output is exactly `from robot import *\n`.
- Function bodies start with `global a, b` (sorted) listing only the non-parameter variables the body assigns: `variables_set`, `var_change`, loop variables.
- `procedures_defreturn` emits its RETURN input as the final `return v`.
- Empty bodies emit `pass`.
- **Line map:** set `STATEMENT_PREFIX` to a marker line `#@@%1`, generate, then strip the marker lines. Each remaining line maps to the id of the nearest marker before it.

- [ ] **Step 1: Write failing tests** (build workspaces from JSON with `Blockly.serialization.workspaces.load`)

```ts
test('line follower', () => expect(gen(lineFollowerJson).code).toBe(readFixture('line_follower.py')));
test('loose blocks are ignored and empty program is just the header', () => expect(gen(looseOnlyJson).code).toBe('from robot import *\n'));
test('global only for assigned variables', () => expect(gen(funcJson).code).toContain('def go():\n    global speed\n    speed = 5\n'));
test('var_change and repeat', () => { const c = gen(miscJson).code; expect(c).toContain('speed += 2\n'); expect(c).toContain('for _ in range(3):\n'); });
test('range forms', () => expect(gen(rangesJson).code).toContain('for i in range(5):\n    pass\nfor i in range(2, 5):\n    pass\nfor i in range(0, 10, 2):\n    pass\n'));
test('precedence', () => expect(gen(precJson).code).toContain('x = (a + b) * c\ny = a - (b - c)\nz = (-a) ** 2\n'));
test('list indices are zero-based', () => expect(gen(listJson).code).toContain('x = xs[0]\n'));
test('line map', () => { const g = gen(lineFollowerJson); expect(g.lineToBlock.get(5)).toBe('motorsLeftId'); });
// names.test.ts
test('names', () => { expect(isValidName('speed_2')).toBe(true); expect(isValidName('скорость')).toBe(false);
  expect(isValidName('2x')).toBe(false); expect(isValidName('while')).toBe(false); });
```
`src/blocks/fixtures/line_follower.py` is the same text as `tests/solutions/first_steps.py`.

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: block set and blocks-to-Python generator`

---

### Task 9: Python → blocks — statements, expressions, fallback, comments

**Files:**
- Create: `src/blocks/comments.ts`, `src/blocks/fromPython.ts`, `src/blocks/fromPython.test.ts`, `src/blocks/fixtures/{robot,control,math,comments,fallback}.py`

**Interfaces:**
- Consumes: `sk()` parser (`Sk.parse('<stdin>.py', src)`, `Sk.astFromParse(cst, '<stdin>.py', flags)`; nodes have `lineno` and `col_offset` but no end positions; names are `node.id.v`, strings `node.s.v`); `toProgramError` (Task 5); `isValidName` (Task 8).
- Produces:
  - `interface Comment { line: number; text: string; trailing: boolean }`; `scanComments(source: string): Comment[]` — string-aware, so `#` inside quotes is not a comment
  - `type FromPythonResult = { ok: true; blocks: object; lineToBlock: Map<number, string> } | { ok: false; error: ProgramError }`
  - `pythonToBlocks(source: string): FromPythonResult` — `blocks` is Blockly serialization JSON; block ids are deterministic (`b1`, `b2`, …); variable ids are `v:<name>`

**Mapping rules:**
- Before parsing, convert `\r\n` to `\n`. Skip `from robot import *`.
- Top-level `def` becomes a separate procedure block; all other top-level statements go, in order, under `robot_start`.
- A statement maps to its block from the Task 8 table when all of its own parts are supported. Otherwise it becomes `python_code` holding its full source text including its nested body. Nested statements are converted independently.
- **Statement span:** from its `lineno` to the line before the next sibling (or the parent's end). Trailing blank lines are trimmed, and so are trailing comment lines indented at or left of the statement. The text is dedented by `col_offset`.
- **Statements:**
  - `x = e` → `variables_set`; `L[i] = e` → `py_list_set`; any other assignment target → fallback
  - `x += e` / `x -= e` → `var_change`; other augmented operators → fallback
  - `if` / `elif` chains → `controls_if` (an `else` holding only an `if` becomes `elif`)
  - `while True:` → `controls_forever`; other `while` → `controls_while`; `while … else` → fallback
  - `for _ in range(n)` → `controls_repeat_ext`; other `for NAME in range(1–3 args)` → `py_for_range`; `for NAME in expr` → `controls_forEach`; `for … else` → fallback
  - `break` / `continue` → `controls_flow_statements`; `pass` → no block
  - `print(x)` with exactly one positional argument → `text_print`; any other `print` → fallback
  - a robot command call → its block
  - an expression statement `f(...)` calling a top-level `def` without `return <value>` → `procedures_callnoreturn` (other calls are handled in Task 10)
- **Expressions:**
  - a numeric literal, or unary minus applied to one → `math_number`
  - other unary minus → `py_neg`; `not` → `logic_negate`
  - `True` / `False` → `logic_boolean`
  - a string → `text`, except `robot_color_value` when it is one side of a `==`/`!=` comparison whose other side is a `color(...)` call and the string is a colour name
  - a name → `variables_get`
  - binary operators → `py_binop`; `and` / `or` → `logic_operation`, nested to the left
  - a single comparison → `logic_compare`; chained comparisons, `in` and `is` → fallback
  - `abs` / `round` with one argument → `py_math_func`
  - a robot sensor call with one string literal that is a valid slot name → its block; any other robot sensor call → fallback
- **Comments:** before emitting each statement, flush all unconsumed comments up to and including its first line as `comment_note` blocks in the current body. At module level, don't flush before a `def`, so comments above a `def` land at the start of its body. Leftover comments go at the end of the main program. Comments inside a fallback statement's span stay in its text.
- **`lineToBlock`:** every line in a statement's span maps to its block id, and inner statements override.
- **Syntax errors:** `{ ok: false, error: toProgramError(e, source, null) }`.

- [ ] **Step 1: Write failing tests.** `roundTrip(src) = blocksToPython(load(pythonToBlocks(src).blocks)).code`.

```ts
for (const f of ['robot', 'control', 'math', 'comments', 'fallback'])
  test(`canonical ${f}.py is a fixed point`, () => expect(roundTrip(readFixture(`${f}.py`))).toBe(readFixture(`${f}.py`)));
test('normalisation', () => {
  expect(roundTrip("from robot import *\n\nx=1\ns = 'a'\n")).toBe('from robot import *\n\nx = 1\ns = "a"\n');
  expect(roundTrip('from robot import *\n\nfor i in range(0, 5):\n    pass\n')).toBe('from robot import *\n\nfor i in range(5):\n    pass\n');
  expect(roundTrip('from robot import *\n\nmotors(1, 1)  # go\n')).toBe('from robot import *\n\n# go\nmotors(1, 1)\n');
});
test('fallback keeps text and runs where it was', () => {
  const r = pythonToBlocks('from robot import *\n\nwhile True:\n    d = {"a": 1}\n    motors(1, 1)\n');
  expect(r.ok && JSON.stringify(r.blocks)).toContain('d = {\\"a\\": 1}');
  expect(roundTrip('from robot import *\n\nwhile True:\n    d = {"a": 1}\n    motors(1, 1)\n')).toBe('from robot import *\n\nwhile True:\n    d = {"a": 1}\n    motors(1, 1)\n');
});
// messy = 2-space indentation, single quotes, `x=1`, trailing comments, `else:` holding only an `if`, `range(0, n)`
test('idempotent on messy input', () => { const once = roundTrip(messy); expect(roundTrip(once)).toBe(once); });
test('crlf and tabs', () => expect(roundTrip('from robot import *\r\n\r\nwhile True:\r\n\tmotors(1, 1)\r\n')).toBe('from robot import *\n\nwhile True:\n    motors(1, 1)\n'));
test('syntax error', () => expect(pythonToBlocks('if x\n  y\n')).toMatchObject({ ok: false, error: { kind: 'SyntaxError', line: 1 } }));
test('nonLatinName', () => expect(pythonToBlocks('скорость = 5\n')).toMatchObject({ ok: false, error: { kind: 'NonLatinName', line: 1 } }));
test('line map', () => { const r = pythonToBlocks(readFixture('control.py')); expect(r.ok && r.lineToBlock.get(4)).toMatch(/^b\d+$/); });
```

**Fixture contents.** Write each fixture exactly as `blocksToPython` would print it.
- `robot.py`: every robot command and sensor, plus `color("right") == "red"`.
- `control.py`: if/elif/else, forever, while, repeat, all three range forms, for-each, break/continue, and/or/not, all six comparisons.
- `math.py`: all seven operators, unary minus, abs, round, parenthesised precedence cases.
- `comments.py`: comments before statements, inside bodies, at the end, and above a function.
- `fallback.py`: `class`, a dict, a list comprehension, `import random`, `try`, a nested `def`, `x.sort()`, `print(a, b)`, `while … else`.

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `comments.ts`, then `fromPython.ts`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: Python-to-blocks converter with fallback block and comments`

---

### Task 10: Python → blocks — functions and lists; full round-trip suite

**Files:**
- Modify: `src/blocks/fromPython.ts`
- Create: `src/blocks/fixtures/{functions,lists}.py`
- Test: `src/blocks/fromPython.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 8–9.
- Produces: no new exports; the mapping is extended as follows.
- **Functions:**
  - A top-level `def` with no `return <value>` anywhere in its body → `procedures_defnoreturn`.
  - Otherwise → `procedures_defreturn`. If its last statement is `return v`, that value goes into the RETURN input; every other `return` becomes `py_return`.
  - Parameters become procedure parameters (the Blockly 13 `extraState.params` shape), with variable ids `v:<name>`.
  - `global` statements inside a `def` produce no block.
  - A call to a `defreturn` function inside an expression → `procedures_callreturn`. A call to it as a statement → fallback.
  - A call to an undefined function → fallback. Nested `def` → fallback (already covered in Task 9).
- **Lists:**
  - `[a, b]` / `[]` → `lists_create_with` (with `itemCount`)
  - `L[i]` with a plain index → `py_list_get` (a negative literal index stays a negative `math_number`); slices → fallback
  - `L.append(v)` statement → `py_list_append`; other methods → fallback
  - `len(L)` → `py_len`; `for x in L` → `controls_forEach`

- [ ] **Step 1: Write failing tests**

```ts
for (const f of ['functions', 'lists'])
  test(`canonical ${f}.py is a fixed point`, () => expect(roundTrip(readFixture(`${f}.py`))).toBe(readFixture(`${f}.py`)));
test('function global lines are regenerated, not duplicated', () =>
  expect(roundTrip('from robot import *\n\ndef go():\n    global speed\n    speed = 5\n\ngo()\n')).toBe('from robot import *\n\ndef go():\n    global speed\n    speed = 5\n\ngo()\n'));
test('trailing return goes into defreturn', () => {
  const r = pythonToBlocks('from robot import *\n\ndef twice(a):\n    return a * 2\n\nx = twice(3)\n');
  expect(r.ok && JSON.stringify(r.blocks)).toContain('"procedures_defreturn"');
  expect(r.ok && JSON.stringify(r.blocks)).toContain('"procedures_callreturn"');
});
test('negative index', () => expect(roundTrip('from robot import *\n\nxs = [1, 2, 3]\nx = xs[-1]\n')).toBe('from robot import *\n\nxs = [1, 2, 3]\nx = xs[-1]\n'));
test('slice and sort fall back', () => {
  const r = pythonToBlocks('from robot import *\n\nys = xs[1:]\nxs.sort()\n');
  expect(r.ok && (JSON.stringify(r.blocks).match(/"python_code"/g) ?? []).length).toBe(2);
});
test('every fixture survives blocks → Python → blocks', () => {
  for (const f of ['robot','control','math','comments','fallback','functions','lists']) {
    const once = roundTrip(readFixture(`${f}.py`)); expect(roundTrip(once)).toBe(once);
  }
});
```

**Fixture contents.**
- `functions.py`: no-arg and two-parameter functions; one with an early `py_return` and a trailing return value; calls both as statements and inside expressions; a function assigning a global.
- `lists.py`: create, get, set, negative index, append, `len`, for-each.

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** the extensions.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: functions and lists in Python-to-blocks`

---

### Task 11: App shell — layout, header, theme, language, storage, Playwright harness

**Files:**
- Create: `src/storage.ts`, `src/storage.test.ts`, `src/ui/state.ts`, `src/ui/theme.ts`, `src/ui/header.ts`, `playwright.config.ts`, `e2e/shell.spec.ts`
- Modify: `index.html`, `src/main.ts`, `src/styles.css`

**Interfaces:**
- Consumes: i18n (Task 7); `Assembly` (Task 2); `TrackId` (Task 3).
- Produces:
  - `storage.ts`:
    - `interface SavedState { v: 1; lang: Lang; theme: 'light' | 'dark' | null; step: 'assembly' | 'program'; trackId: TrackId; assembly: Assembly; python: string; blocks: object | null }`
    - `DEFAULT_PYTHON = 'from robot import *\n'`; `newProject(lang, theme): SavedState`
    - `loadState(): SavedState | null` — wrapped in `try`/`catch`. Returns `null` on missing, corrupt or wrong-version data, or when storage throws.
    - `saveState(s: SavedState): void` — wrapped in `try`/`catch`
    - storage key `robo-trassa:v1`
  - `state.ts`: `getState(): SavedState`, `update(patch: Partial<SavedState>): void` (saves with a 300 ms debounce), `subscribe(fn: (s: SavedState) => void): () => void`
  - `theme.ts`:
    - `applyTheme(saved: 'light' | 'dark' | null)` — sets `<html data-theme>` from the saved choice, falling back to `prefers-color-scheme`
    - `currentTheme(): 'light' | 'dark'`; `onThemeChange(cb)`
  - DOM contract (`data-testid`): `step-assembly`, `step-program`, `lang-ru`, `lang-kk`, `theme-toggle`, `new-project`, `small-screen`, `screen-assembly`, `screen-program`. `<html lang>` follows the language.
  - `playwright.config.ts`:
    - `testDir: 'e2e'`, headless Chromium, `baseURL: 'http://localhost:4173'`, default timeout 60 s
    - `webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true }`

New project: `confirm(t('confirmNewProject'))`; on yes, replace the state with `newProject(currentLang, savedTheme)` (keeps language and theme; no sensors, `DEFAULT_PYTHON`, `blocks: null`, track `first_steps`, step `assembly`).

Styling: colour tokens on `:root` with a dark set under `[data-theme=dark]`. Header as in `docs/mockups/layout-options.html`: name «Робо-трасса», step pills, RU | ҚАЗ, ☀/🌙. The `small-screen` overlay shows below 1200 px width.

- [ ] **Step 1: Write failing tests**

```ts
// storage.test.ts (stub globalThis.localStorage with a Map-backed fake)
test('round trip', () => { const s = newProject('ru', null); saveState(s); expect(loadState()).toEqual(s); });
test('corrupt json → null', () => { fake.set('robo-trassa:v1', '{oops'); expect(loadState()).toBeNull(); });
test('old version → null', () => { fake.set('robo-trassa:v1', JSON.stringify({ v: 0 })); expect(loadState()).toBeNull(); });
test('throwing storage → null, save does not throw', () => { makeStorageThrow(); expect(loadState()).toBeNull(); expect(() => saveState(newProject('ru', null))).not.toThrow(); });
```
```ts
// e2e/shell.spec.ts
test('language switch and persistence', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('lang-kk').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
});
test('theme toggle persists', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' }); await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('theme-toggle').click(); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
test('small window message', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 }); await page.goto('/');
  await expect(page.getByTestId('small-screen')).toBeVisible();
});
```

- [ ] **Step 2: Run** `npm test` and `npm run e2e` — Expected: FAIL.
- [ ] **Step 3: Implement** the files above. `main.ts` loads the state (or creates a new project), applies the theme and language, and renders the header and an empty screen for each step.
- [ ] **Step 4: Run** `npm test` and `npm run e2e` → PASS. Then do the `CLAUDE.md` browser check: header in both languages and both themes, with screenshots.
- [ ] **Step 5: Commit** `feat: app shell with header, themes, languages and saving`

---

### Task 12: Assembly screen

**Files:**
- Create: `src/ui/assembly.ts`, `e2e/assembly.spec.ts`
- Modify: `src/main.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `SLOTS`, `SLOT_NAMES`, `Assembly` (Task 2); `state.ts` (Task 11); i18n.
- Produces: `renderAssembly(root: HTMLElement): void`. It re-renders on state or language change.
- DOM contract:
  - tray items `tray-line`, `tray-distance`, `tray-color` (use `aria-pressed` while selected)
  - slots `slot-<name>` (`data-sensor` attribute = the sensor type, or empty)
  - remove buttons `slot-remove-<name>`
  - slot list rows `slot-row-<name>`
  - next button `to-program`
- Behaviour (spec §4):
  - Click a tray item, then a slot, to place a sensor; dragging a tray item onto a slot (pointer events) also places it.
  - Dropping a placed sensor outside the robot, or clicking ✕, removes it.
  - Placing onto a filled slot replaces its sensor.
  - The robot is drawn top-down in SVG, as in the mockup, with slots at their real positions.

- [ ] **Step 1: Write failing e2e tests**

```ts
test('click to place, replace, remove, persist', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('tray-line').click(); await page.getByTestId('slot-front_left').click();
  await expect(page.getByTestId('slot-front_left')).toHaveAttribute('data-sensor', 'line');
  await page.getByTestId('tray-color').click(); await page.getByTestId('slot-front_left').click();
  await expect(page.getByTestId('slot-front_left')).toHaveAttribute('data-sensor', 'color');
  await page.reload(); await expect(page.getByTestId('slot-front_left')).toHaveAttribute('data-sensor', 'color');
  await page.getByTestId('slot-remove-front_left').click();
  await expect(page.getByTestId('slot-front_left')).toHaveAttribute('data-sensor', '');
});
test('new project clears the robot', async ({ page }) => {
  page.on('dialog', d => d.accept()); await page.goto('/');
  await page.getByTestId('tray-line').click(); await page.getByTestId('slot-left').click();
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('slot-left')).toHaveAttribute('data-sensor', '');
});
test('drag to place', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('tray-distance').dragTo(page.getByTestId('slot-front_center'));
  await expect(page.getByTestId('slot-front_center')).toHaveAttribute('data-sensor', 'distance');
});
test('next goes to program', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('to-program').click(); await expect(page.getByTestId('screen-program')).toBeVisible();
});
```

- [ ] **Step 2: Run** `npm run e2e -- assembly` — Expected: FAIL.
- [ ] **Step 3: Implement** the assembly screen.
- [ ] **Step 4: Run** `npm run e2e` → PASS. Then do the `CLAUDE.md` browser check of the assembly screen in both themes.
- [ ] **Step 5: Commit** `feat: robot assembly screen`

---

### Task 13: Program screen — Blockly, CodeMirror, two-way sync

**Files:**
- Create: `src/ui/blocksPane.ts`, `src/ui/pythonEditor.ts`, `src/ui/sync.ts`, `src/ui/programScreen.ts`, `e2e/program.spec.ts`
- Modify: `src/main.ts`, `src/styles.css`

**Interfaces:**
- Consumes: Tasks 8–11.
- Produces:
  - `createBlocksPane(parent: HTMLElement, onChange: () => void): BlocksPane`, where `BlocksPane` has:
    - `load(json)` — fires no `onChange`
    - `save()`, `workspace()`, `setReadOnly(ro)` (a transparent overlay that captures pointer events), `highlight(blockId | null)`
    - `relocalize()` — save, dispose, re-inject with the current locale and toolbox, load
    - `setDark(dark)`, `resize()`
  - Blockly is injected with `oneBasedIndex: false`. Unattached blocks are greyed out (`Blockly.Events.disableOrphans` listener). The theme is `@blockly/theme-dark` or `Blockly.Themes.Classic`.
  - `createPythonEditor(parent, onChange: (text) => void): PythonEditor`, where `PythonEditor` has:
    - `getText()`; `setText(text)` — fires no `onChange`
    - `setReadOnly(ro)`
    - `setError({ line, message } | null)` — a `@codemirror/lint` diagnostic on that line
    - `highlightLine(line | null)` — a line decoration
    - `setDark(dark)` — via a compartment
  - `class CodeSync`:
    - `constructor(blocks: BlocksPane, editor: PythonEditor)`
    - `readonly lineToBlock: Map<number, string>`, `readonly runBlocked: boolean`
    - `flush(): void` — applies any pending Python edit immediately
    - `onState(cb)` — reports `{ python, blocks }` for saving
  - **Sync rules:**
    - Block change → `blocksToPython` → `editor.setText`; take `lineToBlock` from the generator.
    - Editor change → 500 ms debounce → `pythonToBlocks`. If it succeeds: `blocks.load`, take `lineToBlock` from the converter, clear the error, `runBlocked = false`. If it fails: `editor.setError({ line, message: formatProgramError(e) })`, `runBlocked = true`, and the blocks are left unchanged.
    - A new project, or saved state without `blocks`, is built from `python` via `pythonToBlocks`. When none exists, a `robot_start` block is created.
  - DOM contract: `blocks-pane` (its `data-highlight` attribute = the highlighted block id, or empty), `python-editor` (the CodeMirror root; the running line has class `cm-run-line`), `python-error` (the current error text, if any).
  - e2e helpers in `e2e/helpers.ts`: `gotoProgram`, `setPython`, `openVariablesCategoryAndClickCreate`, `dragFromToolboxIntoStart(page, category, blockLabel)`; Task 14 adds `setupReference(page, id)` (new project + `REFERENCE_ASSEMBLY` + track + solution, not run).
  - Layout: option C from the mockup. The left column has blocks (≈60%) above Python (≈40%); the right column is filled by Task 14.

- [ ] **Step 1: Write failing e2e tests** (helper `setPython(page, text)`: click `python-editor`, press Ctrl+A, `page.keyboard.insertText(text)`)

```ts
test('typing Python builds blocks', async ({ page }) => {
  await gotoProgram(page); await setPython(page, readSolution('first_steps'));
  await expect.poll(() => page.locator('[data-testid=blocks-pane] .blocklyDraggable').count()).toBeGreaterThan(5);
  await page.reload(); await expect(page.getByTestId('python-editor')).toContainText('motors(0, 50)');
});
test('syntax error shows translated message', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'from robot import *\n\nif x\n');
  await expect(page.getByTestId('python-error')).toContainText('Строка 3');
});
test('cyrillic variable', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'скорость = 5\n');
  await expect(page.getByTestId('python-error')).toContainText('латинские буквы');
  const seen: string[] = [];
  page.on('dialog', d => { seen.push(d.type() + ':' + d.message());
    if (seen.length === 1) d.accept('скорость'); else if (seen.length === 2) d.accept(); else d.dismiss(); });
  await openVariablesCategoryAndClickCreate(page);
  await expect.poll(() => seen.length).toBe(3);
  expect(seen[1]).toContain('латинские');
  await expect(page.locator('.blocklyFlyout')).not.toContainText('скорость');
});
test('blocks edit regenerates Python', async ({ page }) => {
  await gotoProgram(page); await dragFromToolboxIntoStart(page, 'Робот', 'стоп');
  await expect(page.getByTestId('python-editor')).toContainText('stop()');
});
test('language and theme switches keep the program; blocks re-labelled', async ({ page }) => {
  await gotoProgram(page); await setPython(page, readSolution('first_steps'));
  await page.getByTestId('theme-toggle').click(); await page.getByTestId('lang-kk').click();
  await expect(page.getByTestId('python-editor')).toContainText('motors(0, 50)');
  await expect(page.getByTestId('blocks-pane')).not.toContainText('повторять');
});
```

- [ ] **Step 2: Run** `npm run e2e -- program` — Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `npm run e2e` → PASS. Then do the `CLAUDE.md` browser check: type Python, edit blocks, switch language and theme; screenshots of both themes.
- [ ] **Step 5: Commit** `feat: program screen with two-way blocks and Python sync`

---

### Task 14: Running on the track — view, readings, controls, highlighting

**Files:**
- Create: `src/ui/trackView.ts`, `src/ui/readings.ts`, `src/ui/runLoop.ts`, `e2e/run.spec.ts`
- Modify: `src/ui/programScreen.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `Session`, `RunOutcome` (Task 6); `readAll`, `Reading` (Task 4); `surfaceAt`, `TRACKS` (Task 3); `CodeSync`, `BlocksPane`, `PythonEditor` (Task 13); i18n.
- Produces:
  - `class TrackView`:
    - `constructor(canvas: HTMLCanvasElement)`; `setTrack(track)` — draws the mat once into an offscreen canvas from the same geometry as `surfaceAt`, plus the dashed start box; mat colours are fixed (the same in both themes)
    - `render(world: World, readings: Reading[])` — draws:
      - the barrier: striped when closed, faded when open
      - the robot body and wheels
      - one dot per sensor, filled when a line or colour sensor detects something
      - each distance beam, up to its hit point or 100 cm
  - `renderReadings(el, readings, time, output)`: one row per sensor, «ДА · яркость 14»-style values, timer `mm:ss.s`, last 5 output lines.
  - `startRunLoop(session: Session, onFrame: () => void): { stop(): void }` — a `requestAnimationFrame` loop that accumulates real time. Each frame runs `await session.step()` sequentially up to 4 times, as owed, then calls `onFrame`. The loop ends when `session.outcome !== 'running'`.
  - DOM contract: `track-select` (`<select>`), `run`, `stop`, `reset`, `track-canvas`, `readings`, `timer`, `banner` (the success or failure message), `status` (program ended or error text).
  - **Behaviour:**
    - **Run:** calls `sync.flush()` first. It's disabled while `sync.runBlocked` is set. It starts a new `Session` from the robot's start position.
    - **During a run:** both editors are read-only. Every frame, the editor highlights `program.line` and the blocks highlight `sync.lineToBlock.get(line)`.
    - **When the run ends:**
      - Success and failures show a translated banner.
      - `programError` shows `formatProgramError`, and the error line and block stay highlighted.
      - `programEnded` shows «Программа завершена».
      - Other highlights are cleared.
    - **Stop:** halts the run where it is. **Reset:** puts the robot back at the start pose.
    - **Changing track:** stops the run and resets the robot.
    - **Changing language during a run:** `blocks.relocalize()`; the run continues.

- [ ] **Step 1: Write failing e2e tests**

```ts
for (const id of ['first_steps', 'barrier', 'colors'] as const)
  test(`demo flow completes ${id}`, async ({ page }) => {
    test.setTimeout(180_000);
    page.on('dialog', d => d.accept()); await page.goto('/'); await page.getByTestId('new-project').click();
    for (const [slot, type] of Object.entries(REFERENCE_ASSEMBLY)) { await page.getByTestId(`tray-${type}`).click(); await page.getByTestId(`slot-${slot}`).click(); }
    await page.getByTestId('to-program').click(); await page.getByTestId('track-select').selectOption(id);
    await setPython(page, readSolution(id)); await page.getByTestId('run').click();
    await expect(page.getByTestId('banner')).toContainText('Трасса пройдена!', { timeout: 150_000 });
  });
test('stop interrupts an infinite loop', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'while True:\n    pass\n'); await page.getByTestId('run').click();
  await page.waitForTimeout(500); await page.getByTestId('stop').click();
  await expect(page.getByTestId('run')).toBeEnabled({ timeout: 1000 });
});
test('runtime error is translated and highlighted', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'from robot import *\n\nmotor(1, 2)\n'); await page.getByTestId('run').click();
  await expect(page.getByTestId('status')).toContainText('Имя «motor» не найдено');
});
test('run applies pending edit', async ({ page }) => {
  await gotoProgram(page); await setPython(page, 'from robot import *\n\nprint("old")\n');
  await page.waitForTimeout(700); await setPython(page, 'from robot import *\n\nprint("new")\n');
  await page.getByTestId('run').click(); await expect(page.getByTestId('readings')).toContainText('new');
});
test('language switch during run', async ({ page }) => {
  test.setTimeout(180_000); await setupReference(page, 'first_steps'); await page.getByTestId('run').click();
  await page.waitForTimeout(2000); await page.getByTestId('lang-kk').click();
  await expect(page.getByTestId('blocks-pane')).not.toHaveAttribute('data-highlight', '');
  await expect(page.getByTestId('banner')).toBeVisible({ timeout: 150_000 });
});
test('editors are read-only while running', async ({ page }) => {
  await setupReference(page, 'first_steps'); await page.getByTestId('run').click();
  await page.getByTestId('python-editor').click(); await page.keyboard.type('zzz');
  await expect(page.getByTestId('python-editor')).not.toContainText('zzz');
});
```
Helpers come from `e2e/helpers.ts`.

- [ ] **Step 2: Run** `npm run e2e -- run` — Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `npm test` and `npm run e2e` → all PASS. Then do the `CLAUDE.md` browser check: run track 1, check the readings, beams and highlighting, and take a screenshot during the run in each theme.
- [ ] **Step 5: Commit** `feat: run robot programs on the track with live readings`

---

### Task 15: Performance, size budget, deployment

**Files:**
- Create: `scripts/check-size.mjs`, `e2e/perf.spec.ts`, `.github/workflows/deploy.yml`
- Modify: `package.json` (add the `size` script)

**Interfaces:**
- Consumes: the whole app.
- Produces:
  - `npm run size` — gzips every file in `dist/`, prints the total, and exits 1 when it is above 3 × 1024 × 1024 bytes.
  - `deploy.yml` — on push to `main`: `npm ci`; `npm test`; `npx playwright install --with-deps chromium`; `npm run e2e`; `npm run build`; `npm run size`; `actions/upload-pages-artifact` (`dist`); `actions/deploy-pages`. It sets the `pages: write` and `id-token: write` permissions.

- [ ] **Step 1: Write failing test** `e2e/perf.spec.ts`

```ts
test('smooth at 4x CPU slowdown', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await setupReference(page, 'first_steps'); await page.getByTestId('run').click(); await page.waitForTimeout(1000);
  const t0 = parseTimer(await page.getByTestId('timer').textContent()); await page.waitForTimeout(5000);
  const t1 = parseTimer(await page.getByTestId('timer').textContent());
  expect(t1 - t0).toBeGreaterThanOrEqual(4.5);                 // simulation keeps ≥ 90 % of real time
  const intervals = await page.evaluate(() => new Promise<number[]>(res => { const xs: number[] = []; let last = performance.now();
    const f = (t: number) => { xs.push(t - last); last = t; xs.length < 120 ? requestAnimationFrame(f) : res(xs); }; requestAnimationFrame(f); }));
  intervals.sort((a, b) => a - b); expect(intervals[Math.floor(intervals.length / 2)]).toBeLessThanOrEqual(20);
});
```

- [ ] **Step 2: Run** `npm run e2e -- perf` — fix any failure it reveals (profile first; likely suspects are redrawing the mat every frame and re-rendering readings DOM wholesale).
- [ ] **Step 3: Implement** `check-size.mjs`, the `size` script, and `deploy.yml`.
- [ ] **Step 4: Run** `npm run build && npm run size` → prints a total ≤ 3 MB and exits 0. Then run `npm test && npm run e2e` → all PASS.
- [ ] **Step 5: Commit** `chore: performance check, size budget and GitHub Pages deploy`

---

## Completion

After Task 15, run the whole suite once more (`npm test && npm run e2e && npm run build && npm run size`) and report its actual output. Then record the remaining owner actions:
- Create the GitHub repository, push, and set Pages → Source to "GitHub Actions".
- Have a native speaker review the Kazakh text in `src/i18n/kk.ts`.
- Replace the working name «Робо-трасса» if needed.
