// Step 1, assembly: the student puts sensors into the robot's five slots, by dragging a sensor onto a slot
// or by clicking a sensor, then a slot. A placed sensor is removed with its ✕ or by dragging it off the robot.
import { onLangChange, sensorLabel, slotLabel, t, type UiKey } from '../i18n';
import { ROBOT, SLOT_NAMES, SLOTS, type Assembly, type SensorType, type SlotName } from '../robot/robot';
import { getState, subscribe, update } from './state';

const SENSORS: readonly SensorType[] = ['line', 'distance', 'color'];

// A sensor drawn in a circle of radius 1, facing up.
function sensorIcon(type: SensorType): string {
  switch (type) {
    case 'line':
      return '<circle r="1" class="s-line"/><circle r="0.36" class="s-eye"/>';
    case 'distance':
      return '<circle r="1" class="s-distance"/><circle cx="-0.42" r="0.3" class="s-eye"/><circle cx="0.42" r="0.3" class="s-eye"/>';
    case 'color':
      return '<path d="M-1 0A1 1 0 0 1 1 0Z" class="s-red"/><path d="M1 0A1 1 0 0 1-1 0Z" class="s-green"/><circle r="0.32" class="s-eye"/>';
  }
}

const iconSvg = (type: SensorType) =>
  `<svg class="sensor-icon" viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true">${sensorIcon(type)}</svg>`;

// The drawing is in centimetres around the robot's centre, with the robot facing up the screen:
// a slot `forward` cm ahead and `left` cm to the left of the centre is drawn at (-left, -forward).
const at = (slot: SlotName) => ({ x: -SLOTS[slot].left, y: -SLOTS[slot].forward });
const SLOT_R = 1.1;
// Where each slot's name is written, from the slot's centre: the three front names are staggered so they don't overlap.
const LABELS: Record<SlotName, [dx: number, dy: number, anchor: string]> = {
  front_left: [-0.3, -1.5, 'end'],
  front_center: [0, -2.3, 'middle'],
  front_right: [0.3, -1.5, 'start'],
  left: [-1.6, 0.3, 'end'],
  right: [1.6, 0.3, 'start'],
};

function robotSvg(): string {
  const w = ROBOT.width, l = ROBOT.length, wheel = ROBOT.wheelBase / 2;
  const wheels = [-wheel, wheel].map(x => `
    <rect class="robot-wheel" x="${x - 1.2}" y="-2.8" width="2.4" height="5.6" rx="0.7"/>`).join('');
  const motorLabels = [-wheel, wheel].map(x => `
    <text class="motor-label" x="${x}" y="4.2" text-anchor="middle" data-text="motor"></text>`).join('');
  const slots = SLOT_NAMES.map(name => {
    const { x, y } = at(name);
    const facing = SLOTS[name].facing * 180 / Math.PI; // positive turns clockwise, as in SVG
    return `
    <g class="slot" data-testid="slot-${name}" data-slot="${name}" data-sensor="" role="button" tabindex="0" transform="translate(${x} ${y})">
      <circle class="slot-ring" r="1.25"/><g class="slot-face" transform="rotate(${facing}) scale(${SLOT_R})"></g>
    </g>`;
  }).join('');
  const labels = SLOT_NAMES.map(name => {
    const { x, y } = at(name);
    const [dx, dy, anchor] = LABELS[name];
    return `
    <text class="slot-label" data-label="${name}" x="${x + dx}" y="${y + dy}" text-anchor="${anchor}"></text>`;
  }).join('');
  return `
  <svg class="robot-svg" viewBox="-12 -14.6 24 24.6">
    <defs><pattern id="cm-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path class="grid-line" d="M1 0H0V1"/></pattern></defs>
    <rect x="-50" y="-50" width="100" height="100" fill="url(#cm-grid)"/>
    <text x="0" y="-13.4" text-anchor="middle" data-text="robotForward"></text>
    <g class="robot">
      <rect class="robot-body" x="${-w / 2}" y="${-l / 2}" width="${w}" height="${l}" rx="2"/>${wheels}${slots}
    </g>${motorLabels}${labels}
  </svg>`;
}

export function renderAssembly(root: HTMLElement): void {
  root.innerHTML = `
    <div class="pane">
      <h2 class="pane-title" data-text="partsTitle"></h2>
      <div class="tray-items">${SENSORS.map(s => `
        <button type="button" class="tray-item" data-testid="tray-${s}" data-type="${s}">${iconSvg(s)}<span></span></button>`).join('')}
      </div>
      <p class="hint"></p>
    </div>
    <div class="pane">
      <h2 class="pane-title" data-text="robotTitle"></h2>${robotSvg()}
    </div>
    <div class="pane">
      <h2 class="pane-title" data-text="slotsTitle"></h2>
      <ul class="slot-list">${SLOT_NAMES.map(name => `
        <li class="slot-row" data-testid="slot-row-${name}" data-sensor="">
          <span class="slot-row-name"><b data-label="${name}"></b><code>${name}</code></span>
          <span class="slot-row-sensor"><svg class="sensor-icon" viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true"></svg><span></span></span>
          <button type="button" class="slot-remove" data-testid="slot-remove-${name}" data-remove="${name}">✕</button>
        </li>`).join('')}
      </ul>
      <button type="button" class="to-program" data-testid="to-program" data-text="toProgram"></button>
    </div>`;

  const byId = (id: string) => root.querySelector<HTMLElement>(`[data-testid=${id}]`)!;
  const slotOf = (el: Element | null) => (el?.closest<SVGElement>('.slot')?.dataset.slot ?? null) as SlotName | null;
  let selected: SensorType | null = null; // the tray sensor clicked last, waiting for a slot
  let ignoreClick = false; // a drag just ended: its pointerup may still produce a click

  // Writes a new assembly object: a running simulation keeps the one it started with.
  const editAssembly = (edit: (a: Assembly) => void) => {
    const assembly = { ...getState().assembly };
    edit(assembly);
    selected = null;
    update({ assembly });
  };

  const clickSlot = (slot: SlotName) => {
    const type = selected;
    if (type) editAssembly(a => { a[slot] = type; });
  };

  root.addEventListener('click', e => {
    if (ignoreClick) return;
    const el = e.target as Element;
    const trayType = el.closest<HTMLElement>('.tray-item')?.dataset.type as SensorType | undefined;
    const removeSlot = el.closest<HTMLElement>('.slot-remove')?.dataset.remove as SlotName | undefined;
    const slot = slotOf(el);
    if (trayType) {
      selected = selected === trayType ? null : trayType;
      refresh();
    } else if (removeSlot) {
      editAssembly(a => { delete a[removeSlot]; });
    } else if (slot) {
      clickSlot(slot);
    } else if (el.closest('.to-program')) {
      update({ step: 'program' });
    }
  });

  root.addEventListener('keydown', e => {
    const slot = slotOf(e.target as Element);
    if (slot && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      clickSlot(slot);
    }
  });

  // Dragging: a press on a tray sensor or a placed one becomes a drag once the pointer moves a few pixels.
  root.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const el = e.target as Element;
    const from = slotOf(el);
    const type = (el.closest<HTMLElement>('.tray-item')?.dataset.type as SensorType | undefined)
      ?? (from ? getState().assembly[from] : undefined);
    if (type) startDrag(e, type, from);
  });

  const startDrag = (down: PointerEvent, type: SensorType, from: SlotName | null) => {
    let ghost: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 5) return;
        ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.innerHTML = iconSvg(type);
        document.body.append(ghost);
        root.classList.add('is-picking');
        if (from) byId(`slot-${from}`).classList.add('lifted');
      }
      ghost.style.translate = `${e.clientX}px ${e.clientY}px`;
    };
    const end = (e: PointerEvent) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      if (!ghost) return; // no drag: the press was a click
      ghost.remove();
      root.querySelector('.lifted')?.classList.remove('lifted');
      ignoreClick = true;
      setTimeout(() => { ignoreClick = false; });
      if (e.type === 'pointerup') drop(type, from, document.elementFromPoint(e.clientX, e.clientY));
      refresh();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  };

  // A sensor dropped on a slot goes there (leaving the slot it came from); a placed sensor dropped off the robot is removed.
  const drop = (type: SensorType, from: SlotName | null, under: Element | null) => {
    const to = slotOf(under);
    if (to === from) return; // back where it started
    if (!to && (!from || under?.closest('.robot'))) return; // a tray sensor that missed the slots, or a placed one put down on the robot
    editAssembly(a => {
      if (from) delete a[from];
      if (to) a[to] = type;
    });
  };

  const refresh = () => {
    const { assembly } = getState();
    for (const e of root.querySelectorAll<HTMLElement>('[data-text]')) e.textContent = t(e.dataset.text as UiKey);
    for (const e of root.querySelectorAll<HTMLElement>('[data-label]')) e.textContent = slotLabel(e.dataset.label as SlotName);
    root.classList.toggle('is-picking', selected !== null);
    root.querySelector('.hint')!.textContent = t(selected ? 'assemblyHintPick' : 'assemblyHint');
    for (const s of SENSORS) {
      const item = byId(`tray-${s}`);
      item.ariaPressed = String(selected === s);
      item.querySelector('span')!.textContent = sensorLabel(s);
    }
    for (const name of SLOT_NAMES) {
      const type = assembly[name];
      const slot = byId(`slot-${name}`);
      const row = byId(`slot-row-${name}`);
      slot.dataset.sensor = row.dataset.sensor = type ?? '';
      slot.querySelector('.slot-face')!.innerHTML = type ? sensorIcon(type) : '<circle r="1" class="slot-empty"/>';
      slot.setAttribute('aria-label', `${slotLabel(name)}: ${type ? sensorLabel(type) : t('slotEmpty')}`);
      row.querySelector('.slot-row-sensor svg')!.innerHTML = type ? sensorIcon(type) : '';
      row.querySelector('.slot-row-sensor span')!.textContent = type ? sensorLabel(type) : t('slotEmpty');
      const remove = byId(`slot-remove-${name}`);
      remove.title = remove.ariaLabel = `${t('removeSensor')}: ${slotLabel(name)}`;
    }
  };
  refresh();
  subscribe(refresh);
  onLangChange(refresh);
}
