# CLAUDE.md

This is a browser-based 2D robotics simulator for school students aged 8–16, top-down view.
For now - student-facing part only:
1. Robot assembly: a chassis with two motors; the student places sensors (line, distance, color) into slots.
2. A block-based program, with the same code shown in Python next to it.
3. Running on a track: the robot follows a line, and sensor readings are visible in real time.

## Dependencies (my candidates; challenge them during brainstorming):
- Build and language: Vite + TypeScript.
- Blocks: Blockly. It generates Python source from the blocks.
- Execution: Skulpt, a Python interpreter that runs in the browser.
  Single execution path: Blockly generates Python, Skulpt runs it,
  and the student can also edit the Python by hand. The program must
  run in step with the simulation and stop on a button press,
  including infinite loops. No custom Python interpreter and
  no separate JavaScript execution path.
- Graphics: Canvas 2D with no physics engine; differential-drive
  kinematics is enough.
- Deployment: GitHub Pages, so the customer can open a link
  instead of only watching a video.

## Claude directives about code
I don't want to go deep into code. Code architecture, code design, and microarchitecture are completely up to you. Just do your best and keep code simple and readable. When I ask for a high-level feature, you should ask only clarifying questions about those featues, not code design decisions.

## Browser verification
- No display in this container; the `playwright` MCP is headless. Never use
  `--headed`, `--ui`, `--debug`, `show-report`, `codegen`, `page.pause()`.
- Dev server: `npm run dev` → http://localhost:5173; if not up, start it as a
  background Bash task and poll until 200.
- After any UI change: `browser_navigate` → `browser_snapshot` → exercise the
  change → `browser_console_messages` level `error` must be empty →
  screenshot into `.playwright-mcp/` only for visual changes, inspect with
  Read → `browser_close`. Report what was verified; never "done" on typecheck alone.
- Prefer snapshot/`browser_find` over screenshots; use `depth` on large pages.

## Git authorship
- email forworkandtravel@yandex.ru, name "wisp"

## Files to ignore
Ignore those files completely, as they are not your concern.
- build_claudecode_isolation_container.sh
- run_claudecode_isolation_container.sh
- claudecode.dockerfile
- check_grammar.sh

---

# Engineering Principles

## 1. Think Before Coding
- **Stop and ask** if requirements are ambiguous. Do not guess.
- **State assumptions explicitly** before writing any non-trivial code.
- **Present multiple interpretations** with tradeoffs if more than one valid approach exists.
- **Push back** if a requested change is over-engineered or adds unnecessary complexity.

## 2. Simplicity First
- Write the **minimum code** required to solve the task.
- Avoid speculative features, abstractions for single-use code, or "future-proofing."
- If a 200-line solution can be 50 lines, rewrite it.
- **Seniority Test**: If a senior engineer would call it "bloated," simplify it.

## 3. Surgical Changes
- **Touch only what is required.** Match existing code style perfectly.
- Do not "improve" adjacent code, refactor unrelated sections, or change formatting/quotes.
- **Preserve comments** you don't fully understand; do not delete them.
- Every line changed must trace directly to the current request.

## 4. Goal-Driven Execution
- Transform tasks into **verifiable goals** (e.g., "Write a failing test for [bug], then make it pass").
- Provide a brief plan for multi-step tasks before starting.
- **Loop until verified**: Do not declare success until you have run the relevant tests or verification steps.

