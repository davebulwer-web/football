// Title, friendly set-up and controls screens.

import { readMenu, Repeater } from '../core/input';
import { menuBlip } from '../core/audio';
import { TEAMS, pickKits } from '../data/teams';
import { drawText } from '../render/text';
import { VH, VW } from '../render/view';
import type { MatchConfig, Mode } from '../match/match';

type Screen = 'main' | 'friendly' | 'controls';

interface Item {
  label: () => string;
  enabled?: boolean;
  left?: () => void;
  right?: () => void;
  select?: () => void;
  swatch?: () => string[];
}

const MODES: { mode: Mode; label: string }[] = [
  { mode: '1p', label: '1 PLAYER VS CPU' },
  { mode: '2p', label: '2 PLAYERS' },
  { mode: 'cpu', label: 'CPU VS CPU' },
];
const HALVES = [1, 2, 3, 5, 10, 20, 45];

export class Menu {
  screen: Screen = 'main';
  sel = 0;
  mode = 0;
  home = 0;
  away = 14;
  half = 2;
  private up = new Repeater();
  private down = new Repeater();
  private left = new Repeater();
  private right = new Repeater();
  private fire = new Repeater();
  private back = new Repeater();
  private t = 0;
  private armed = false;
  onStart: (cfg: MatchConfig) => void;

  constructor(onStart: (cfg: MatchConfig) => void) {
    this.onStart = onStart;
  }

  private items(): Item[] {
    if (this.screen === 'main') {
      const soon = (label: string): Item => ({ label: () => `${label}  (SOON)`, enabled: false });
      return [
        { label: () => 'FRIENDLY', select: () => this.go('friendly') },
        soon('LEAGUE'),
        soon('CUP'),
        soon('PRACTICE'),
        soon('PENALTIES'),
        soon('TEAM EDITOR'),
        { label: () => 'CONTROLS', select: () => this.go('controls') },
      ];
    }
    if (this.screen === 'friendly') {
      const cyc = (v: number, n: number, d: number) => (v + d + n) % n;
      const kits = () => pickKits(TEAMS[this.home], TEAMS[this.away]);
      return [
        {
          label: () => `< ${MODES[this.mode].label} >`,
          left: () => (this.mode = cyc(this.mode, MODES.length, -1)),
          right: () => (this.mode = cyc(this.mode, MODES.length, 1)),
        },
        {
          label: () => `HOME  < ${TEAMS[this.home].name.toUpperCase()} >`,
          left: () => (this.home = cyc(this.home, TEAMS.length, -1)),
          right: () => (this.home = cyc(this.home, TEAMS.length, 1)),
          swatch: () => [kits()[0].shirt, kits()[0].shorts],
        },
        {
          label: () => `AWAY  < ${TEAMS[this.away].name.toUpperCase()} >`,
          left: () => (this.away = cyc(this.away, TEAMS.length, -1)),
          right: () => (this.away = cyc(this.away, TEAMS.length, 1)),
          swatch: () => [kits()[1].shirt, kits()[1].shorts],
        },
        {
          label: () => `HALF LENGTH  < ${HALVES[this.half]} MIN >`,
          left: () => (this.half = cyc(this.half, HALVES.length, -1)),
          right: () => (this.half = cyc(this.half, HALVES.length, 1)),
        },
        { label: () => 'KICK OFF', select: () => this.start() },
        { label: () => 'BACK', select: () => this.go('main') },
      ];
    }
    return [{ label: () => 'BACK', select: () => this.go('main') }];
  }

  private go(s: Screen) {
    this.screen = s;
    this.sel = s === 'friendly' ? 4 : 0;
  }

  private start() {
    if (this.home === this.away) this.away = (this.away + 1) % TEAMS.length;
    this.onStart({
      home: TEAMS[this.home],
      away: TEAMS[this.away],
      mode: MODES[this.mode].mode,
      halfSeconds: HALVES[this.half] * 60,
    });
  }

  reset() {
    this.armed = false;
  }

  update(dt: number) {
    this.t += dt;
    const c = readMenu();
    // wait for all buttons to be released after arriving here
    if (!this.armed) {
      if (!c.kick && !c.pause && !c.dx && !c.dy) this.armed = true;
      return;
    }
    const items = this.items();
    const step = (d: number) => {
      let s = this.sel;
      for (let i = 0; i < items.length; i++) {
        s = (s + d + items.length) % items.length;
        if (items[s].enabled !== false) break;
      }
      if (s !== this.sel) menuBlip();
      this.sel = s;
    };
    if (this.up.tick(c.dy < 0, dt)) step(-1);
    if (this.down.tick(c.dy > 0, dt)) step(1);
    const it = items[this.sel];
    if (this.left.tick(c.dx < 0, dt) && it.left) {
      it.left();
      menuBlip();
    }
    if (this.right.tick(c.dx > 0, dt) && it.right) {
      it.right();
      menuBlip();
    }
    if (this.fire.tick(c.kick, dt) && it.select) {
      menuBlip(true);
      it.select();
    }
    if (this.back.tick(c.pause, dt) && this.screen !== 'main') {
      menuBlip();
      this.go('main');
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // backdrop: grass stripes and a stand
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? '#3f8f3a' : '#4a9c42';
      ctx.fillRect(i * 40, 0, 40, VH);
    }
    ctx.fillStyle = 'rgba(8,10,14,0.72)';
    ctx.fillRect(0, 0, VW, VH);
    const bob = Math.round(Math.sin(this.t * 2) * 2);
    drawText(ctx, 'TOUCHLINE', VW / 2, 22 + bob, '#f2cc1c', 'center', 32, '#7a3a10');
    drawText(ctx, 'INTERNATIONAL FOOTBALL', VW / 2, 62, '#ffffff', 'center', 8);

    if (this.screen === 'controls') return this.drawControls(ctx);

    const items = this.items();
    const top = this.screen === 'main' ? 92 : 100;
    items.forEach((it, i) => {
      const y = top + i * 18;
      const on = i === this.sel;
      const col = it.enabled === false ? '#6a7080' : on ? '#f2cc1c' : '#ffffff';
      if (on) {
        ctx.fillStyle = 'rgba(242,204,28,0.15)';
        ctx.fillRect(60, y - 4, VW - 120, 16);
      }
      drawText(ctx, it.label(), VW / 2, y, col, 'center');
      const sw = it.swatch?.();
      if (sw) {
        ctx.fillStyle = '#101010';
        ctx.fillRect(VW - 92, y - 2, 12, 12);
        ctx.fillStyle = sw[0];
        ctx.fillRect(VW - 91, y - 1, 10, 6);
        ctx.fillStyle = sw[1];
        ctx.fillRect(VW - 91, y + 5, 10, 4);
      }
    });
    const hint = this.screen === 'main' ? 'UP/DOWN TO CHOOSE, KICK TO SELECT' : 'LEFT/RIGHT TO CHANGE, ESC TO GO BACK';
    drawText(ctx, hint, VW / 2, VH - 16, '#9aa3b5', 'center');
  }

  private drawControls(ctx: CanvasRenderingContext2D) {
    const lines: [string, string][] = [
      ['MOVE', 'ARROWS / WASD / STICK'],
      ['KICK', 'SPACE / PAD A  (HOLD = POWER)'],
      ['SPRINT', 'SHIFT / PAD B or RT'],
      ['PAUSE', 'ESC / START'],
      ['', ''],
      ['PASS', 'LET GO OF KICK. THE DIRECTION'],
      ['', 'HELD SETS THE ANGLE'],
      ['CROSS-FIELD', 'PUSH SIDEWAYS WHILE RUNNING'],
      ['LOFT', 'PULL BACK AS YOU KICK'],
      ['SHOOT', 'KICK AT GOAL. UP/DOWN AIMS'],
      ['TACKLE', 'KICK NEAR THE MAN ON THE BALL'],
      ['2 PLAYERS', 'P1 WASD+SPACE  P2 ARROWS+ENTER'],
    ];
    lines.forEach(([a, b], i) => {
      const y = 84 + i * 13;
      drawText(ctx, a, 40, y, '#f2cc1c');
      drawText(ctx, b, 150, y, '#ffffff');
    });
    ctx.fillStyle = 'rgba(242,204,28,0.15)';
    ctx.fillRect(60, VH - 26, VW - 120, 16);
    drawText(ctx, 'BACK', VW / 2, VH - 22, '#f2cc1c', 'center');
  }
}
