// Keyboard and gamepad input, merged into simple per-player control states.

export interface Controls {
  /** -1, 0 or 1 on each axis (8-way, like a joystick). Up is -1. */
  dx: number;
  dy: number;
  kick: boolean;
  sprint: boolean;
  pause: boolean;
}

export type Scheme = 'solo' | 'left' | 'right' | 'none';

interface KeyMap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  kick: string[];
  sprint: string[];
  pause: string[];
}

const KEYMAPS: Record<Exclude<Scheme, 'none'>, KeyMap> = {
  solo: {
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    kick: ['Space', 'KeyZ', 'KeyJ'],
    sprint: ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyK'],
    pause: ['Escape', 'KeyP'],
  },
  left: {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    kick: ['Space'],
    sprint: ['ShiftLeft'],
    pause: ['Escape'],
  },
  right: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    kick: ['Enter', 'NumpadEnter', 'Slash', 'ControlRight'],
    sprint: ['ShiftRight'],
    pause: ['Escape'],
  },
};

const held = new Set<string>();
// Keys pressed since the last game tick, so very quick taps are never missed.
const tapped = new Set<string>();

export function endTick() {
  tapped.clear();
}
const GAME_KEYS = new Set(Object.values(KEYMAPS).flatMap((m) => Object.values(m).flat()));

let firstInputListeners: (() => void)[] = [];
function fireFirstInput() {
  const l = firstInputListeners;
  firstInputListeners = [];
  l.forEach((f) => f());
}

addEventListener('keydown', (e) => {
  held.add(e.code);
  tapped.add(e.code);
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  fireFirstInput();
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());
addEventListener('pointerdown', () => fireFirstInput());
addEventListener('gamepadconnected', () => fireFirstInput());

export function onFirstInput(f: () => void) {
  firstInputListeners.push(f);
}

const any = (codes: string[]) => codes.some((c) => held.has(c) || tapped.has(c));

const DEAD = 0.38;

function readPad(index: number): Controls | null {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads[index];
  if (!p || !p.connected) return null;
  const b = (i: number) => !!p.buttons[i] && p.buttons[i].pressed;
  const ax = p.axes[0] ?? 0;
  const ay = p.axes[1] ?? 0;
  let dx = ax > DEAD ? 1 : ax < -DEAD ? -1 : 0;
  let dy = ay > DEAD ? 1 : ay < -DEAD ? -1 : 0;
  if (b(12)) dy = -1;
  if (b(13)) dy = 1;
  if (b(14)) dx = -1;
  if (b(15)) dx = 1;
  if (dx || dy) fireFirstInput();
  return {
    dx,
    dy,
    kick: b(0) || b(2),
    sprint: b(1) || b(5) || b(7),
    pause: b(9),
  };
}

export function readControls(scheme: Scheme, padIndex: number | null): Controls {
  const c: Controls = { dx: 0, dy: 0, kick: false, sprint: false, pause: false };
  if (scheme !== 'none') {
    const m = KEYMAPS[scheme];
    c.dx = (any(m.right) ? 1 : 0) - (any(m.left) ? 1 : 0);
    c.dy = (any(m.down) ? 1 : 0) - (any(m.up) ? 1 : 0);
    c.kick = any(m.kick);
    c.sprint = any(m.sprint);
    c.pause = any(m.pause);
  }
  if (padIndex !== null) {
    const p = readPad(padIndex);
    if (p) {
      if (!c.dx) c.dx = p.dx;
      if (!c.dy) c.dy = p.dy;
      c.kick ||= p.kick;
      c.sprint ||= p.sprint;
      c.pause ||= p.pause;
    }
  }
  return c;
}

/** Menu input: any keyboard scheme or any connected pad. */
export function readMenu(): Controls {
  const c = readControls('solo', null);
  c.kick ||= any(['Enter', 'NumpadEnter']);
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < pads.length; i++) {
    const p = readPad(i);
    if (!p) continue;
    if (!c.dx) c.dx = p.dx;
    if (!c.dy) c.dy = p.dy;
    c.kick ||= p.kick;
    c.pause ||= p.pause || (!!pads[i]?.buttons[1]?.pressed);
  }
  return c;
}

/** Edge detector for menus: returns true once per press, with key-repeat while held. */
export class Repeater {
  private t = 0;
  private last = false;
  tick(on: boolean, dt: number): boolean {
    if (!on) {
      this.last = false;
      this.t = 0;
      return false;
    }
    if (!this.last) {
      this.last = true;
      this.t = 0.35;
      return true;
    }
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.11;
      return true;
    }
    return false;
  }
}
