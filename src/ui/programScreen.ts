// Step 2, the program (layout option C): the blocks above their Python on the left, the track on the right.
import { formatProgramError, onLangChange, t, trackName, type UiKey } from '../i18n';
import type { Assembly } from '../robot/robot';
import { readAll } from '../sim/sensors';
import { Session } from '../sim/session';
import { createWorld, type World } from '../sim/world';
import { getTrack, TRACKS, type TrackId } from '../tracks/tracks';
import { createBlocksPane, type BlocksPane } from './blocksPane';
import { createPythonEditor, type PythonEditor } from './pythonEditor';
import { formatTime, renderReadings } from './readings';
import { startRunLoop } from './runLoop';
import { getState, subscribe, update } from './state';
import { CodeSync, type ProgramState } from './sync';
import { currentTheme, onThemeChange } from './theme';
import { TrackView } from './trackView';

const STILL_HINT_MS = 1000; // real time a run's world time may stand still before the noCommands hint

export function renderProgramScreen(root: HTMLElement): void {
  const code = root.querySelector<HTMLElement>('.program-code')!;
  code.innerHTML = `
    <div class="pane"><h2 class="pane-title" data-text="blocksTitle"></h2></div>
    <div class="pane"><h2 class="pane-title" data-text="pythonTitle"></h2></div>`;
  const [blocksBox, pythonBox] = code.querySelectorAll<HTMLElement>('.pane');
  const track = root.querySelector<HTMLElement>('.program-track')!;
  track.innerHTML = `
    <div class="pane track-pane">
      <div class="track-bar">
        <label class="track-choice"><span data-text="trackLabel"></span><select data-testid="track-select">${
          TRACKS.map(tr => `<option value="${tr.id}"></option>`).join('')}</select></label>
        <button type="button" class="run-button" data-testid="run" data-text="run"></button>
        <button type="button" data-testid="stop" data-text="stop"></button>
        <button type="button" data-testid="reset" data-text="reset"></button>
      </div>
      <div class="track-box">
        <canvas data-testid="track-canvas"></canvas>
        <p class="banner" data-testid="banner" hidden></p>
      </div>
      <p class="run-status" data-testid="status" hidden></p>
      <div class="readings" data-testid="readings"></div>
    </div>`;

  // The panes report the student's edits to the sync, which is created right after them.
  const blocks = createBlocksPane(blocksBox, () => sync.blocksChanged());
  const editor = createPythonEditor(pythonBox, () => sync.pythonChanged());
  const sync = new CodeSync(blocks, editor);

  const applyTheme = () => {
    const dark = currentTheme() === 'dark';
    blocks.setDark(dark);
    editor.setDark(dark);
  };
  applyTheme();
  onThemeChange(applyTheme);

  const translate = () => {
    for (const e of root.querySelectorAll<HTMLElement>('[data-text]')) e.textContent = t(e.dataset.text as UiKey);
  };
  translate();
  onLangChange(() => {
    translate();
    blocks.relocalize();
  });
  setUpRunning(track, sync, blocks, editor);

  // The program saved last; any other program in the state (a new project) is loaded into the editors.
  // Loaded last, so the screen is fully set up whatever the saved program holds.
  let saved: ProgramState | null = null;
  sync.onState(state => {
    saved = state;
    update(state);
  });
  const loadProgram = () => {
    const { python, blocks: json } = getState();
    if (python !== saved?.python || json !== saved?.blocks) sync.load(python, json);
  };
  subscribe(loadProgram);
  loadProgram();
}

// Run, Stop, Reset and the track menu. A run is shown on the mat and in the readings every frame, with the line and
// block being run highlighted; its result stays on screen until the next run or a reset.
function setUpRunning(panel: HTMLElement, sync: CodeSync, blocks: BlocksPane, editor: PythonEditor): void {
  const byId = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>(`[data-testid=${id}]`)!;
  const select = byId<HTMLSelectElement>('track-select');
  const runButton = byId<HTMLButtonElement>('run');
  const stopButton = byId<HTMLButtonElement>('stop');
  const banner = byId('banner');
  const status = byId('status');
  const readingsBox = byId('readings');
  const view = new TrackView(byId<HTMLCanvasElement>('track-canvas'));

  let session: Session | null = null; // the run going on, or the last one; null after a reset
  let loop: { stop(): void } | null = null; // while a run is going on
  let idle: World; // the robot at the start, shown when there is no run
  let shownTrackId: TrackId; // what the robot and the mat were set up from
  let shownAssembly: Assembly;
  let highlighted: number | null = null; // the line (and its block) highlighted in the editors
  let moved = { time: 0, at: 0 }; // the run's world time when it was last seen to change, and the real time (ms) then

  function show(): void {
    const world = session?.world ?? idle;
    const readings = readAll(world);
    view.render(world, readings);
    renderReadings(readingsBox, readings, world.time, session?.output ?? []);
  }

  function highlight(line: number | null): void {
    if (line === highlighted) return;
    highlighted = line;
    editor.highlightLine(line);
    blocks.highlight(line === null ? null : sync.lineToBlock.get(line) ?? null);
  }

  function setRunning(running: boolean): void {
    editor.setReadOnly(running);
    blocks.setReadOnly(running);
    refreshButtons();
    showResult();
  }

  function refreshButtons(): void {
    runButton.disabled = loop !== null || sync.runBlocked;
    stopButton.disabled = loop === null;
  }

  // The result of a finished run: the track's verdict as a banner on the mat, the program's below it.
  function showResult(): void {
    const { verdict, note } = loop || !session ? { verdict: '', note: '' } : resultTexts(session);
    banner.textContent = verdict;
    banner.hidden = !verdict;
    banner.classList.toggle('is-success', session?.outcome === 'success');
    status.textContent = note;
    status.hidden = !note;
    status.classList.toggle('is-error', session?.outcome === 'programError');
  }

  function onFrame(): void {
    const s = session!;
    if (s.outcome === 'running') highlight(s.program.line);
    show();
    if (s.outcome !== 'running') finishRun();
    else showStill(s.world.time);
  }

  // World time passes only while the program gives commands or reads sensors. When it has stood still for
  // STILL_HINT_MS of a run, a hint in the status line says why; it goes as soon as time moves or the run ends.
  function showStill(time: number): void {
    const now = performance.now();
    if (time !== moved.time) moved = { time, at: now };
    const hint = now - moved.at >= STILL_HINT_MS ? t('noCommands') : '';
    if (status.textContent === hint) return;
    status.textContent = hint;
    status.hidden = !hint;
  }

  // The run has ended or was stopped. A program error keeps its line and block highlighted.
  function finishRun(): void {
    loop!.stop();
    loop = null;
    const s = session!;
    highlight(s.outcome === 'programError' ? s.program.error?.line ?? null : null);
    setRunning(false);
  }

  function stopRun(): void {
    if (!loop) return;
    session!.stop();
    finishRun();
  }

  // Stops any run and puts the robot at the start of the selected track.
  function reset(): void {
    stopRun();
    const { trackId, assembly } = getState();
    shownTrackId = trackId;
    shownAssembly = assembly;
    view.setTrack(getTrack(trackId));
    idle = createWorld(getTrack(trackId), { ...assembly });
    session = null;
    highlight(null);
    showResult();
    show();
  }

  runButton.onclick = () => {
    sync.flush(); // an edit still waiting for the typing pause is run too
    if (sync.runBlocked) return;
    highlight(null); // the last run's error line: the program may have been edited since
    const { trackId, assembly } = getState();
    session = new Session(getTrack(trackId), { ...assembly }, editor.getText()); // a copy: the world keeps it
    moved = { time: 0, at: performance.now() };
    loop = startRunLoop(session, onFrame);
    setRunning(true);
  };
  stopButton.onclick = stopRun;
  byId('reset').onclick = reset;
  select.onchange = () => update({ trackId: select.value as TrackId });

  // Another track or robot (a new project too) stops the run and starts again from the start.
  subscribe(s => {
    select.value = s.trackId;
    if (s.trackId !== shownTrackId || s.assembly !== shownAssembly) reset();
  });
  sync.onState(refreshButtons); // a Python error appeared or was fixed
  const nameTracks = () => TRACKS.forEach((tr, i) => { select.options[i].textContent = `${i + 1}. ${trackName(tr.id)}`; });
  onLangChange(() => {
    nameTracks();
    showResult();
    show();
  });
  nameTracks();
  select.value = getState().trackId;
  reset();
  refreshButtons();
}

function resultTexts(s: Session): { verdict: string; note: string } {
  switch (s.outcome) {
    case 'success': return { verdict: t('trackComplete', { time: formatTime(s.world.time) }), note: '' };
    case 'crash':
    case 'offField':
    case 'missedRed': return { verdict: t(s.outcome), note: '' };
    case 'programError': return { verdict: '', note: formatProgramError(s.program.error!) };
    case 'programEnded': return { verdict: '', note: t('programEnded') };
    default: return { verdict: '', note: '' }; // stopped
  }
}
