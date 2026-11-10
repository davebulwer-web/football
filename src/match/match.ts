// The match: rules, ball physics, kicking, player control and computer AI.

import { colourDistance, pickKits, type TeamDef } from '../data/teams';
import { readControls } from '../core/input';
import * as sfx from '../core/audio';
import {
  Ball,
  BOX_DEPTH,
  BOX_HALF,
  Controller,
  FORMATION,
  GOAL_H,
  GOAL_HALF,
  KEEPER_SCALE,
  L,
  MID_Y,
  Player,
  Team,
  W,
} from './entities';

export type Mode = '1p' | '2p' | 'cpu' | 'practice';
export type Phase = 'restart' | 'play' | 'dead' | 'goal' | 'halftime' | 'fulltime';
export type RestartKind = 'kickoff' | 'throw' | 'corner' | 'goalkick';

export interface MatchConfig {
  home: TeamDef;
  away: TeamDef;
  mode: Mode;
  halfSeconds: number;
}

interface Restart {
  kind: RestartKind;
  team: Team;
  taker: Player;
  x: number;
  y: number;
  t: number;
}

const G = 9.8;
/** Releasing kick before the power bar reaches this is a quick tap pass. */
const TAP_CHARGE = 0.2;
const CIRCLE_R = 9.15;
/** How long a diving keeper stays down after the dive. */
const DIVE_LAND = 0.3;
const rand = Math.random;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function gauss() {
  return (rand() + rand() + rand() - 1.5) * 1.15;
}

/** Turn joystick input into a kick direction relative to the way the player was running. */
export function resolveKick(fx: number, fy: number, ix: number, iy: number) {
  const il = Math.hypot(ix, iy);
  if (il === 0) return { dx: fx, dy: fy, loft: false };
  const ux = ix / il;
  const uy = iy / il;
  const dot = ux * fx + uy * fy;
  if (dot < -0.9) return { dx: fx, dy: fy, loft: true }; // pulled back: loft it forward
  if (dot < -0.1) {
    // diagonally back: square ball
    const px = ux - dot * fx;
    const py = uy - dot * fy;
    const pl = Math.hypot(px, py) || 1;
    return { dx: px / pl, dy: py / pl, loft: false };
  }
  if (dot < 0.69) {
    // sideways while running: diagonal forward (cross-field ball)
    const vx = fx + ux;
    const vy = fy + uy;
    const vl = Math.hypot(vx, vy) || 1;
    return { dx: vx / vl, dy: vy / vl, loft: false };
  }
  return { dx: ux, dy: uy, loft: false };
}

function snap8(x: number, y: number): [number, number] {
  const k = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  const a = (k * Math.PI) / 4;
  return [Math.round(Math.cos(a) * 1000) / 1000, Math.round(Math.sin(a) * 1000) / 1000];
}

export class Match {
  ball = new Ball();
  teams: [Team, Team];
  players: Player[] = [];
  phase: Phase = 'restart';
  phaseT = 0;
  restart: Restart | null = null;
  pending: (() => void) | null = null;
  half = 1;
  clock = 0;
  halfSeconds: number;
  banner = '';
  bannerT = 0;
  firstKickoff: Team;
  lastScorer: Player | null = null;
  lastKicker: Player | null = null;
  /** Team-mate running onto the last pass. */
  receiver: Player | null = null;
  mode: Mode;

  constructor(cfg: MatchConfig) {
    this.mode = cfg.mode;
    this.halfSeconds = cfg.halfSeconds;
    const [hk, ak] = pickKits(cfg.home, cfg.away);
    const home = new Team(cfg.home, hk, 0);
    const away = new Team(cfg.away, ak, 1);
    home.dir = 1;
    away.dir = -1;
    home.opp = away;
    away.opp = home;
    this.teams = [home, away];
    // goalkeepers must stand out from both outfield kits
    const spare = ['#2c9c4c', '#e0c020', '#202020', '#e07020', '#8a2be2'];
    for (const t of this.teams) {
      const clashes = (c: string) =>
        colourDistance(c, t.kit.shirt) < 110 || colourDistance(c, t.opp.kit.shirt) < 110 || colourDistance(c, t.opp.keeperKit.shirt) < 60;
      if (clashes(t.keeperKit.shirt)) {
        const c = spare.find((x) => !clashes(x)) ?? '#2c9c4c';
        t.keeperKit = { shirt: c, shorts: '#202020', socks: c };
      }
    }
    for (const t of this.teams) {
      const n = cfg.mode === 'practice' && t === away ? 1 : 11;
      for (let i = 0; i < n; i++) {
        const p = new Player(t, i, t.def.players[i]);
        t.players.push(p);
        this.players.push(p);
      }
    }
    if (cfg.mode === '1p' || cfg.mode === 'practice') home.ctrl = new Controller(0, 'solo', 0);
    if (cfg.mode === '2p') {
      home.ctrl = new Controller(0, 'left', 0);
      away.ctrl = new Controller(1, 'right', 1);
    }
    this.firstKickoff = cfg.mode === 'practice' || rand() < 0.5 ? home : away;
    this.startKickoff(this.firstKickoff);
    sfx.setCrowd(0.06);
  }

  get controllers(): Controller[] {
    return this.teams.map((t) => t.ctrl).filter((c): c is Controller => !!c);
  }

  /** Match minutes for the clock display. */
  get minutes() {
    return Math.min(45, (this.clock / this.halfSeconds) * 45) + (this.half - 1) * 45;
  }

  showBanner(text: string, t = 2) {
    this.banner = text;
    this.bannerT = t;
  }

  // ------------------------------------------------------------------ restarts

  /** Set up a kick-off. After a goal (walk = true) the players jog back instead of jumping to their spots. */
  startKickoff(team: Team, walk = false) {
    if (this.mode === 'practice') team = this.teams[0];
    this.ball.owner = null;
    this.ball.place(L / 2, MID_Y);
    for (const t of this.teams) {
      if (walk) {
        for (const p of t.players) p.stun = p.dive = p.hold = 0;
        continue;
      }
      for (const p of t.players) {
        const [fx, fy] = FORMATION[p.idx];
        let tx = Math.min(fx, p.idx >= 9 ? (t === team ? 50 : 42) : 46);
        if (p.isKeeper) tx = 2;
        p.x = t.dir > 0 ? tx : L - tx;
        p.y = fy;
        p.vx = p.vy = 0;
        p.fx = t.dir;
        p.fy = 0;
        p.stun = p.dive = p.hold = 0;
        p.charging = false;
      }
    }
    if (!walk) {
      const partner = team.players[10];
      partner.x = L / 2 - team.dir * 0.5;
      partner.y = MID_Y + 3;
    }
    this.startRestart('kickoff', team, L / 2, MID_Y);
    sfx.whistle(false);
  }

  startRestart(kind: RestartKind, team: Team, x: number, y: number) {
    // in practice every throw-in and corner is yours
    if (this.mode === 'practice' && kind !== 'goalkick') team = this.teams[0];
    let taker: Player;
    if (kind === 'kickoff') taker = team.players[9];
    else if (kind === 'goalkick') taker = team.players[0];
    else taker = this.nearestOutfield(team, x, y)!;
    this.restart = { kind, team, taker, x, y, t: 0 };
    this.phase = 'restart';
    this.phaseT = 0;
    this.ball.place(x, y);
    this.ball.owner = taker;
    let fx = team.dir as number;
    let fy = 0;
    if (kind === 'throw') {
      fx = 0;
      fy = y < MID_Y ? 1 : -1;
    } else if (kind === 'corner') {
      [fx, fy] = snap8(L / 2 - x, MID_Y - y);
    }
    taker.fx = fx;
    taker.fy = fy;
    taker.lockFx = fx;
    taker.lockFy = fy;
    taker.x = x - fx * 0.5;
    taker.y = y - fy * 0.5;
    taker.vx = taker.vy = 0;
    taker.charging = false;
    taker.hold = 0;
    taker.cooldown = 0;
    taker.stun = 0;
    if (team.ctrl && kind !== 'goalkick') team.ctrl.controlled = taker;
  }

  nearestOutfield(team: Team, x: number, y: number, exclude?: Player | null): Player | null {
    let best: Player | null = null;
    let bd = Infinity;
    for (const p of team.players) {
      if (p.isKeeper || p === exclude) continue;
      const d = p.dist(x, y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ update

  update(dt: number) {
    for (const c of this.controllers) {
      c.prevKick = c.input.kick;
      c.input = readControls(c.scheme, c.pad);
      if (c.input.kick && !c.prevKick) c.sinceKickPress = 0;
      else c.sinceKickPress += dt;
    }
    this.phaseT += dt;
    if (this.bannerT > 0) this.bannerT -= dt;

    const waitingForKickoff = this.phase === 'restart' && this.restart?.kind === 'kickoff';
    if ((this.phase === 'play' || this.phase === 'restart' || this.phase === 'dead') && !waitingForKickoff) {
      this.clock += dt;
      if (this.clock >= this.halfSeconds && this.phase !== 'restart') {
        this.endHalf();
      }
    }

    switch (this.phase) {
      case 'restart':
        this.updateRestart(dt);
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'dead':
        this.updateLoose(dt, false);
        if (this.phaseT > 0.9 && this.pending) {
          const f = this.pending;
          this.pending = null;
          f();
        }
        break;
      case 'goal':
        this.updateLoose(dt, false);
        if (this.phaseT > 3.2) {
          const conceded = this.lastScorer ? this.lastScorer.team.opp : this.teams[0];
          this.startKickoff(conceded, true);
        }
        break;
      case 'halftime':
        this.updateLoose(dt, false);
        if (this.phaseT > 3.5) this.secondHalf();
        break;
      case 'fulltime':
        this.updateLoose(dt, false);
        break;
    }
    sfx.updateAudio(dt);
  }

  endHalf() {
    sfx.whistle(true, this.half === 1 ? 2 : 3);
    this.ball.owner = null;
    this.restart = null;
    this.pending = null;
    if (this.half === 1) {
      this.phase = 'halftime';
      this.showBanner('HALF TIME', 3.5);
    } else {
      this.phase = 'fulltime';
      this.showBanner('FULL TIME', 9999);
      sfx.roar();
    }
    this.phaseT = 0;
  }

  secondHalf() {
    this.half = 2;
    this.clock = 0;
    for (const t of this.teams) t.dir = t.dir > 0 ? -1 : 1;
    this.startKickoff(this.firstKickoff.opp);
  }

  private updateRestart(dt: number) {
    const r = this.restart!;
    r.t += dt;
    const taker = r.taker;
    taker.vx = taker.vy = 0;
    this.ball.x = taker.x + taker.fx * 0.5;
    this.ball.y = taker.y + taker.fy * 0.5;
    this.ball.z = r.kind === 'throw' ? 2.0 : 0;

    for (const p of this.players) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.kickAnim = Math.max(0, p.kickAnim - dt);
      if (p === taker) continue;
      if (p.human) this.humanMove(p, dt, false);
      else this.aiMove(p, dt);
      this.integrate(p, dt);
      if (r.kind === 'kickoff' && p.human) this.keepOutAtKickoff(p, r);
    }
    this.separate();

    let ready = true;
    if (r.kind === 'kickoff') {
      ready = this.kickoffReady(r);
      // nobody should hold the game up for long
      if (!ready && r.t > 8) {
        for (const p of this.players) if (p !== taker) this.keepOutAtKickoff(p, r);
        ready = true;
      }
    }
    if (!ready) {
      if (taker.human) taker.charging = false;
      return;
    }
    if (taker.human && r.t > 0.4) {
      this.humanKickInput(taker, dt);
    } else if (!taker.human && r.t > 1.1) {
      this.aiRestartKick(r);
    }
  }

  /** Everyone in their own half, and the other side outside the centre circle. */
  private kickoffReady(r: Restart) {
    for (const p of this.players) {
      if (p === r.taker) continue;
      if ((p.x - L / 2) * p.team.dir > 0.05) return false;
      if (p.team !== r.team && Math.hypot(p.x - r.x, p.y - r.y) < CIRCLE_R - 0.3) return false;
    }
    return true;
  }

  private keepOutAtKickoff(p: Player, r: Restart) {
    const t = p.team;
    p.x = t.dir > 0 ? Math.min(p.x, L / 2) : Math.max(p.x, L / 2);
    if (t !== r.team) {
      const dx = p.x - r.x;
      const dy = p.y - r.y;
      const d = Math.hypot(dx, dy);
      if (d < CIRCLE_R) {
        // slide round the circle edge, staying in our half
        const ux = d > 0.01 && dx * t.dir < 0 ? dx / d : -t.dir;
        const uy = d > 0.01 && dx * t.dir < 0 ? dy / d : 0;
        p.x = r.x + ux * CIRCLE_R;
        p.y = r.y + uy * CIRCLE_R;
      }
    }
  }

  private updatePlay(dt: number) {
    for (const t of this.teams) this.updateControl(t, dt);
    for (const p of this.players) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.ignoreBall = Math.max(0, p.ignoreBall - dt);
      p.tackleT = Math.max(0, p.tackleT - dt);
      p.kickAnim = Math.max(0, p.kickAnim - dt);
      if (p.stun > 0) {
        p.stun -= dt;
        p.vx *= 0.85;
        p.vy *= 0.85;
        this.integrate(p, dt);
        continue;
      }
      if (this.receiver === p && !this.ball.owner && !(p.human && (p.team.ctrl!.input.dx || p.team.ctrl!.input.dy))) {
        this.runOntoBall(p, dt);
        if (p.human) this.humanDefend(p);
      } else if (p.human) {
        const owns = this.ball.owner === p;
        if (owns) this.humanKickInput(p, dt);
        if (!p.charging) this.humanMove(p, dt, owns);
        if (!owns) this.humanDefend(p);
      } else if (p.isKeeper) {
        this.keeperAI(p, dt);
      } else if (this.ball.owner === p) {
        this.ownerAI(p, dt);
      } else {
        this.aiMove(p, dt);
        this.aiTackle(p, dt);
      }
      this.integrate(p, dt);
    }
    this.separate();
    this.stepBall(dt);
    if (this.receiver && this.ball.speed < 0.3 && this.ball.z === 0) this.receiver = null;
    this.ballContacts();
    this.checkOut();
    this.updateCrowd();
  }

  /** Ball rolls free, players drift to shape (dead ball, goal, half time). */
  private updateLoose(dt: number, contacts: boolean) {
    this.ball.owner = null;
    for (const p of this.players) {
      p.kickAnim = Math.max(0, p.kickAnim - dt);
      p.dive = Math.max(0, p.dive - dt);
      p.charging = false;
      if (p.human && this.phase === 'dead') this.humanMove(p, dt, false);
      else this.aiMove(p, dt, this.phase !== 'dead' && !(this.phase === 'goal' && this.phaseT > 1.5));
      this.integrate(p, dt);
    }
    this.separate();
    this.stepBall(dt);
    if (this.phase === 'goal') this.keepInNet();
    if (contacts) this.ballContacts();
  }

  private updateCrowd() {
    const b = this.ball;
    let level = 0.06;
    for (const t of this.teams) {
      const d = Math.abs(t.attackGoalX - b.x);
      if (d < 25 && (b.owner?.team === t || b.lastTouch === t)) level = Math.max(level, 0.06 + (25 - d) * 0.006);
    }
    sfx.setCrowd(level);
  }

  // ------------------------------------------------------------------ movement

  private integrate(p: Player, dt: number) {
    p.faceT = Math.max(0, p.faceT - dt);
    p.x = clamp(p.x + p.vx * dt, -4, L + 4);
    p.y = clamp(p.y + p.vy * dt, -3, W + 3);
    const sp = Math.hypot(p.vx, p.vy);
    p.anim += sp * dt * 1.6;
    if (this.ball.owner === p) {
      const b = this.ball;
      if (p.isKeeper && p.hold > 0) {
        p.x = clamp(p.x, 0.8, L - 0.8);
        b.x = p.x;
        b.y = p.y + 0.1;
        b.z = p.dive > 0 ? 0.5 : 1.1;
      } else if (this.phase !== 'restart') {
        b.x = p.x + p.fx * 0.55;
        b.y = p.y + p.fy * 0.55;
        b.z = 0;
        b.roll += sp * dt * 3;
      }
      b.vx = p.vx;
      b.vy = p.vy;
      b.vz = 0;
    }
  }

  private steer(p: Player, dvx: number, dvy: number, dt: number, face = true) {
    const ax = dvx - p.vx;
    const ay = dvy - p.vy;
    const m = Math.hypot(ax, ay);
    const maxA = (24 + p.skills.pace * 0.1) * dt;
    if (m > maxA) {
      p.vx += (ax / m) * maxA;
      p.vy += (ay / m) * maxA;
    } else {
      p.vx = dvx;
      p.vy = dvy;
    }
    if (face && Math.hypot(dvx, dvy) > 0.5) this.face(p, dvx, dvy, p.human || Math.hypot(dvx, dvy) > 2.5);
  }

  /** Turn to face a direction; computer players can't flick back and forth every frame. */
  private face(p: Player, x: number, y: number, force: boolean) {
    const [fx, fy] = snap8(x, y);
    if (fx === p.fx && fy === p.fy) return;
    if (!force) {
      if (p.faceT > 0) return;
      // ignore small changes so a direction on the boundary doesn't flicker
      const l = Math.hypot(x, y) || 1;
      if ((x * p.fx + y * p.fy) / l > 0.82) return;
    }
    p.fx = fx;
    p.fy = fy;
    p.faceT = 0.5;
  }

  private moveTo(p: Player, tx: number, ty: number, speed: number, dt: number) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    // arrive and settle; only set off again once the target has moved well away
    if (p.settled ? d < 1.6 : d < 0.5) {
      p.settled = true;
      this.steer(p, 0, 0, dt, false);
      const bx = this.ball.x - p.x;
      const by = this.ball.y - p.y;
      if (Math.hypot(bx, by) > 2) this.face(p, bx, by, false);
      return;
    }
    p.settled = false;
    const s = Math.max(1.5, speed * Math.min(1, d / 2));
    this.steer(p, (dx / d) * s, (dy / d) * s, dt);
  }

  private separate() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 0.7) {
          // a keeper with the ball in his hands can't be barged about
          const aFixed = a.isKeeper && a.hold > 0;
          const bFixed = b.isKeeper && b.hold > 0;
          const ka = aFixed ? 0 : bFixed ? 1 : 0.5;
          const kb = 1 - ka;
          const push = 0.7 - d;
          a.x -= (dx / d) * push * ka;
          a.y -= (dy / d) * push * ka;
          b.x += (dx / d) * push * kb;
          b.y += (dy / d) * push * kb;
        }
      }
  }

  // ------------------------------------------------------------------ humans

  private updateControl(t: Team, dt: number) {
    const c = t.ctrl;
    if (!c) return;
    const o = this.ball.owner;
    if (o && o.team === t && !o.isKeeper) {
      c.controlled = o;
      return;
    }
    if (c.controlled?.charging) return;
    c.switchT -= dt;
    if (c.switchT > 0 && c.controlled && !c.controlled.isKeeper) return;
    c.switchT = 0.12;
    const b = this.ball;
    const px = b.x + b.vx * 0.35;
    const py = b.y + b.vy * 0.35;
    const best = this.nearestOutfield(t, px, py);
    if (!best) return;
    const cur = c.controlled;
    if (!cur || cur.isKeeper || (best !== cur && best.dist(px, py) < cur.dist(px, py) - 2.5)) {
      if (cur) cur.charging = false;
      c.controlled = best;
    }
  }

  private humanMove(p: Player, dt: number, owns: boolean) {
    const c = p.team.ctrl!;
    const { dx, dy, sprint } = c.input;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      this.steer(p, 0, 0, dt, false);
      return;
    }
    const s = p.topSpeed(sprint, owns);
    this.steer(p, (dx / len) * s, (dy / len) * s, dt);
  }

  private humanKickInput(p: Player, dt: number) {
    const c = p.team.ctrl!;
    const pressed = c.input.kick && !c.prevKick;
    if (!p.charging) {
      if (pressed && p.cooldown <= 0) {
        p.charging = true;
        p.charge = 0;
        p.lockFx = p.fx;
        p.lockFy = p.fy;
      }
      return;
    }
    p.charge = Math.min(1, p.charge + dt / 0.7);
    if (this.phase === 'play') {
      // keep running the way we were going while the power builds
      const sp = Math.hypot(p.vx, p.vy) * 0.97;
      this.steer(p, p.lockFx * sp, p.lockFy * sp, dt, false);
    }
    if (!c.input.kick) {
      const tap = p.charge < TAP_CHARGE;
      if (!(tap && this.smartPass(p, c.input.dx, c.input.dy))) this.humanKick(p, c.input.dx, c.input.dy, p.charge);
      p.charging = false;
    }
  }

  /**
   * Quick tap: pass to the best-placed team-mate roughly the way you're facing (or pushing).
   * Pass accuracy and weight depend on the passer's Passing skill. Returns false if nobody is there.
   */
  private smartPass(p: Player, ix: number, iy: number): boolean {
    const kind = this.restart?.kind;
    if (kind === 'kickoff') return false; // kick-off tap already plays it back
    const k = resolveKick(p.lockFx, p.lockFy, ix, iy);
    const opp = p.team.opp.players;
    let best: Player | null = null;
    let bestScore = Infinity;
    for (const t of p.team.players) {
      if (t === p || t.isKeeper) continue;
      const tx = t.x + t.vx * 0.5 - p.x;
      const ty = t.y + t.vy * 0.5 - p.y;
      const d = Math.hypot(tx, ty);
      if (d < 3 || d > (kind === 'throw' ? 22 : 40)) continue;
      const ang = Math.acos(clamp((tx * k.dx + ty * k.dy) / d, -1, 1));
      if (ang > 0.9) continue; // about 50 degrees either side
      let lane = Infinity;
      for (const o of opp) {
        const u = clamp(((o.x - p.x) * tx + (o.y - p.y) * ty) / (d * d), 0, 1);
        lane = Math.min(lane, Math.hypot(p.x + tx * u - o.x, p.y + ty * u - o.y));
      }
      const score = ang * 14 + d * 0.22 - Math.min(lane, 4) * 1.2;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (!best) return false;
    const tx = best.x + best.vx * 0.5;
    const ty = best.y + best.vy * 0.5;
    if (kind === 'throw') {
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(15, 4 + d * 0.7);
      this.kickBall(p, (dx / d) * sp, (dy / d) * sp, 3.2, 0.3);
      return true;
    }
    const d = p.dist(tx, ty);
    let lane = Infinity;
    for (const o of opp) lane = Math.min(lane, o.dist((p.x + tx) / 2, (p.y + ty) / 2));
    this.passTo(p, tx, ty, d > 26 || lane < 1.5, 3);
    return true;
  }

  private humanKick(p: Player, ix: number, iy: number, power: number) {
    const kind = this.restart?.kind;
    const k = resolveKick(p.lockFx, p.lockFy, ix, iy);
    if (kind === 'throw') {
      const sp = 5 + power * 10;
      const d = k.loft ? { dx: p.lockFx, dy: p.lockFy } : { dx: k.dx, dy: k.dy };
      // a throw always goes some way into the pitch, never along or back over the line
      const inward = p.y < MID_Y ? 1 : -1;
      if (d.dy * inward < 0.4) {
        d.dy = 0.4 * inward;
        d.dx = Math.sign(d.dx || p.team.dir) * Math.sqrt(1 - 0.16);
      }
      this.kickBall(p, d.dx * sp, d.dy * sp, 3 + power * 1.5, power * 0.5);
      return;
    }
    const t = p.team;
    if (kind === 'kickoff') {
      // kick-off: tap to play it back to a midfielder, or pass the way you push
      const il = Math.hypot(ix, iy);
      if (il === 0) {
        const mid = [t.players[6], t.players[7]].sort((a, b) => a.dist(p.x, p.y) - b.dist(p.x, p.y))[0];
        this.passTo(p, mid.x, mid.y, false);
        return;
      }
      const [ax, ay] = this.assist(p, ix / il, iy / il);
      const sp = 6 + power * 18;
      this.kickBall(p, ax * sp, ay * sp, 0, power);
      return;
    }
    const distGoal = Math.abs(t.attackGoalX - p.x);
    const wide = Math.abs(p.y - MID_Y);
    if (kind !== 'corner' && distGoal < 34 && wide < 22 && k.dx * t.dir > 0.45) {
      const aimY = MID_Y + (iy !== 0 ? iy * (GOAL_HALF - 1) : (rand() - 0.5) * 4);
      this.shoot(p, aimY, power, k.loft);
      return;
    }
    const [ax, ay] = this.assist(p, k.dx, k.dy);
    if (k.loft) {
      const sp = 8 + power * 15;
      this.kickBall(p, ax * sp, ay * sp, 5 + power * 6.5, power);
    } else {
      const sp = 6 + power * 22;
      // only the softest taps stay on the floor; anything harder lifts a little
      this.kickBall(p, ax * sp, ay * sp, power > 0.15 ? (power - 0.15) * 7 : 0, power);
    }
  }

  /** Gentle pass assist: bend the pass onto a team-mate within ~17 degrees. */
  private assist(p: Player, dx: number, dy: number): [number, number] {
    let best: Player | null = null;
    let bestA = 0.3;
    for (const t of p.team.players) {
      if (t === p) continue;
      const tx = t.x + t.vx * 0.3 - p.x;
      const ty = t.y + t.vy * 0.3 - p.y;
      const d = Math.hypot(tx, ty);
      if (d < 4 || d > 45) continue;
      const a = Math.acos(clamp((tx * dx + ty * dy) / d, -1, 1));
      if (a < bestA) {
        bestA = a;
        best = t;
      }
    }
    if (!best) return [dx, dy];
    const tx = best.x + best.vx * 0.3 - p.x;
    const ty = best.y + best.vy * 0.3 - p.y;
    const d = Math.hypot(tx, ty);
    const f = bestA < 0.2 ? 1 : 0.5;
    const vx = dx * (1 - f) + (tx / d) * f;
    const vy = dy * (1 - f) + (ty / d) * f;
    const l = Math.hypot(vx, vy);
    return [vx / l, vy / l];
  }

  private humanDefend(p: Player) {
    const c = p.team.ctrl!;
    if (!(c.input.kick && !c.prevKick)) return;
    const o = this.ball.owner;
    if (o && o.team !== p.team && !(o.isKeeper && o.hold > 0) && p.dist(o.x, o.y) < 2.0 && p.tackleT <= 0) {
      // lunge into the tackle
      p.vx += p.fx * 3;
      p.vy += p.fy * 3;
      this.tackle(p, o);
    }
  }

  // ------------------------------------------------------------------ kicking

  kickBall(p: Player, vx: number, vy: number, vz: number, power: number, shot = false) {
    const b = this.ball;
    b.owner = null;
    b.vx = vx;
    b.vy = vy;
    b.vz = vz;
    this.receiver = shot ? null : this.pickReceiver(p);
    if (this.receiver && p.team.ctrl) p.team.ctrl.controlled = this.receiver;
    b.lastTouch = p.team;
    p.cooldown = 0.35;
    p.kickAnim = 0.25;
    p.charging = false;
    p.hold = 0;
    this.lastKicker = p;
    sfx.kickSound(power);
    if (this.phase === 'restart') {
      this.phase = 'play';
      this.phaseT = 0;
      this.restart = null;
    }
  }

  /** Where p can first meet the loose ball, and how long that takes. */
  intercept(p: Player): { x: number; y: number; t: number } {
    const b = this.ball;
    let x = b.x;
    let y = b.y;
    let z = b.z;
    let vx = b.vx;
    let vy = b.vy;
    let vz = b.vz;
    const sp = p.topSpeed(true, false);
    const dt = 0.1;
    for (let t = 0; t <= 3; t += dt) {
      if (z <= 1.6 && p.dist(x, y) / sp <= t + 0.15) return { x, y, t };
      x += vx * dt;
      y += vy * dt;
      if (z > 0 || vz > 0) {
        vz -= G * dt;
        z = Math.max(0, z + vz * dt);
        if (z === 0) vz = 0;
      } else {
        const f = Math.exp(-0.85 * dt);
        vx *= f;
        vy *= f;
      }
    }
    return { x, y, t: 9 };
  }

  private pickReceiver(kicker: Player): Player | null {
    let best: Player | null = null;
    let bt = 2.8;
    for (const m of kicker.team.players) {
      if (m === kicker || m.isKeeper) continue;
      const i = this.intercept(m);
      if (i.t < bt) {
        bt = i.t;
        best = m;
      }
    }
    return best;
  }

  private runOntoBall(p: Player, dt: number) {
    const i = this.intercept(p);
    this.moveTo(p, i.x, i.y, p.topSpeed(p.dist(i.x, i.y) > 3, false), dt);
  }

  private pressure(p: Player): number {
    let d = Infinity;
    for (const o of p.team.opp.players) d = Math.min(d, p.dist(o.x, o.y));
    return d;
  }

  /** Shot with power and a skill-based spread around the aimed line. */
  shoot(p: Player, aimY: number, power: number, chip: boolean) {
    const gx = p.team.attackGoalX;
    const sk = p.skills.shooting;
    const sigmaDeg = 1.2 + (100 - sk) * 0.07 + power * power * 4 + (this.pressure(p) < 2 ? 2.5 : 0);
    const ang = Math.atan2(aimY - p.y, gx - p.x) + (gauss() * sigmaDeg * Math.PI) / 180;
    const sp = chip ? 11 + power * 7 : 15 + power * 17;
    let vz = chip ? 5.5 + power * 2.5 : 0.8 + power * 2.2 + gauss() * power * (1.2 + (100 - sk) / 45);
    vz = Math.max(0.2, vz);
    this.kickBall(p, Math.cos(ang) * sp, Math.sin(ang) * sp, vz, Math.max(0.5, power), true);
  }

  /** Computer pass with a speed chosen to reach the target. */
  passTo(p: Player, tx: number, ty: number, loft: boolean, errScale = 1) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    // weaker passers misjudge the weight as well as the line
    const d = (Math.hypot(dx, dy) || 1) * (1 + gauss() * (100 - p.skills.passing) * 0.0015 * errScale);
    const err = (gauss() * (100 - p.skills.passing) * 0.04 * errScale * Math.PI) / 180;
    const ang = Math.atan2(dy, dx) + err;
    if (loft) {
      const vz = 5 + d * 0.11;
      const T = (2 * vz) / G;
      const sp = (d / T) * 0.9;
      this.kickBall(p, Math.cos(ang) * sp, Math.sin(ang) * sp, vz, 0.7);
    } else {
      const sp = Math.min(28, d * 0.85 + 4);
      this.kickBall(p, Math.cos(ang) * sp, Math.sin(ang) * sp, 0, sp / 30);
    }
  }

  private bestPass(p: Player, allowBack = true) {
    let best: { t: Player; score: number; lane: number; d: number } | null = null;
    const opp = p.team.opp.players;
    for (const t of p.team.players) {
      if (t === p || t.isKeeper) continue;
      const tx = t.x + t.vx * 0.4;
      const ty = t.y + t.vy * 0.4;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 5 || d > 42) continue;
      const progress = dx * p.team.dir;
      if (!allowBack && progress < 0) continue;
      let lane = Infinity;
      let space = Infinity;
      for (const o of opp) {
        const u = clamp(((o.x - p.x) * dx + (o.y - p.y) * dy) / (d * d), 0, 1);
        lane = Math.min(lane, Math.hypot(p.x + dx * u - o.x, p.y + dy * u - o.y));
        space = Math.min(space, o.dist(tx, ty));
      }
      const loftable = d > 16;
      if (lane < 1.4 && !loftable) continue;
      const score = progress * 0.45 + Math.min(lane, 5) * 0.8 + Math.min(space, 7) * 0.7 - d * 0.06 + (rand() - 0.5) * 2;
      if (!best || score > best.score) best = { t, score, lane, d };
    }
    return best;
  }

  // ------------------------------------------------------------------ AI

  private positionTarget(p: Player): [number, number] {
    const t = p.team;
    const b = this.ball;
    const [fx, fy] = FORMATION[p.idx];
    const ballX = this.phase === 'goal' || this.phase === 'halftime' ? L / 2 : b.x;
    const adv = (ballX - L / 2) * t.dir;
    const poss = b.owner ? b.owner.team === t : b.lastTouch === t;
    let tx = fx + adv * 0.6 + (poss ? 8 : -2);
    if (p.idx >= 9 && poss) tx += 5;
    if (p.idx >= 1 && p.idx <= 4) tx = Math.min(tx, 64);
    tx = clamp(tx, 5, 99);
    let ty = fy + (b.y - MID_Y) * 0.35;
    let wx = t.dir > 0 ? tx : L - tx;
    // keep the distance at restarts
    const r = this.restart;
    if (r && r.team !== t) {
      const d = Math.hypot(wx - r.x, ty - r.y);
      if (d < 9.5) {
        const k = 9.5 / (d || 1);
        wx = r.x + (wx - r.x) * k;
        ty = r.y + (ty - r.y) * k;
      }
    }
    if (r?.kind === 'kickoff' || this.phase === 'goal') {
      // stay in own half
      wx = t.dir > 0 ? Math.min(wx, L / 2 - 1) : Math.max(wx, L / 2 + 1);
    }
    return [wx, clamp(ty, 2, W - 2)];
  }

  /** The keeper with the ball in his hands, if there is one. */
  private keeperHolding(): Player | null {
    const o = this.ball.owner;
    return o && o.isKeeper && o.hold > 0 ? o : null;
  }

  /** The player on this team who should chase a loose ball. */
  private chaser(t: Team): Player | null {
    const b = this.ball;
    if (b.owner && b.owner.team === t) return null;
    if (this.keeperHolding()) return null; // give the keeper room
    if (this.phase !== 'play') return null;
    if (t.ctrl) return null;
    if (this.receiver && this.receiver.team === t) return null;
    const px = b.x + b.vx * 0.4;
    const py = b.y + b.vy * 0.4;
    return this.nearestOutfield(t, px, py);
  }

  private aiMove(p: Player, dt: number, relaxed = false) {
    if (p.isKeeper && this.phase === 'play') return this.keeperAI(p, dt);
    const b = this.ball;
    if (!relaxed && this.chaser(p.team) === p) {
      const d = p.dist(b.x, b.y);
      const t = Math.min(1, d / 8);
      const tx = b.x + b.vx * t * 0.6;
      const ty = b.y + b.vy * t * 0.6;
      this.moveTo(p, tx, ty, p.topSpeed(d > 4, false), dt);
      return;
    }
    let [tx, ty] = this.phase === 'play' && !p.isKeeper ? this.organicTarget(p, dt) : this.positionTarget(p);
    if (p.isKeeper) {
      tx = p.team.goalX + p.team.dir * 1.5;
      ty = MID_Y;
    }
    if (this.phase !== 'play') {
      p.runT = 0;
      p.tgtX = NaN;
    }
    // the other side's keeper has it in his hands: back off to the edge of his box
    const k = this.keeperHolding();
    if (k && k.team !== p.team && this.inBox(k.team, tx, ty)) {
      const kt = k.team;
      tx = kt.goalX + kt.dir * (BOX_DEPTH + 1.5);
      p.runT = 0;
    }
    const d = p.dist(tx, ty);
    const sprint = p.runT > 0 || (d > 10 && !relaxed);
    const sp = p.topSpeed(sprint, false) * (relaxed ? 0.6 : sprint || d > 3 ? 1 : 0.7);
    this.moveTo(p, tx, ty, sp, dt);
  }

  /**
   * Formation spot plus a personal drift, the odd run into space when we have the ball,
   * and a short reaction lag so the shape breathes instead of moving in lockstep.
   */
  private organicTarget(p: Player, dt: number): [number, number] {
    const t = p.team;
    const b = this.ball;
    const poss = b.owner ? b.owner.team === t : b.lastTouch === t;
    let [tx, ty] = this.positionTarget(p);

    p.wobT -= dt;
    if (p.wobT <= 0) {
      p.wobT = 2.5 + rand() * 3.5;
      p.wobX = (rand() - 0.5) * 8;
      p.wobY = (rand() - 0.5) * 7;
    }
    tx += p.wobX;
    ty += p.wobY;

    if (p.runT > 0) {
      p.runT -= dt;
      if (!poss) p.runT = 0;
      else return [p.runX, p.runY];
    } else if (poss && b.owner && b.owner !== p && p !== this.receiver) {
      const rate = p.idx >= 9 ? 0.4 : p.idx >= 5 ? 0.2 : p.idx === 1 || p.idx === 4 ? 0.07 : 0;
      const carrier = b.owner;
      const behindPlay = (p.x - carrier.x) * t.dir < 18;
      if (behindPlay && rand() < rate * dt) {
        const goal = t.attackGoalX;
        p.runX = clamp(Math.max(p.x * t.dir, carrier.x * t.dir) * t.dir + t.dir * (8 + rand() * 14), 6, L - 6);
        if (t.dir > 0) p.runX = Math.min(p.runX, goal - 6);
        else p.runX = Math.max(p.runX, goal + 6);
        if (p.idx >= 9) p.runY = MID_Y + (rand() - 0.5) * 22;
        else if (p.idx === 1 || p.idx === 4 || p.idx === 5 || p.idx === 8) p.runY = p.y < MID_Y ? 5 + rand() * 8 : W - 5 - rand() * 8;
        else p.runY = p.y + (rand() - 0.5) * 16;
        p.runY = clamp(p.runY, 3, W - 3);
        p.runT = 1.8 + rand() * 1.6;
        return [p.runX, p.runY];
      }
    }

    // reaction lag
    if (Number.isNaN(p.tgtX)) {
      p.tgtX = tx;
      p.tgtY = ty;
    }
    const k = Math.min(1, dt * (1 + p.skills.pace / 100));
    p.tgtX += (tx - p.tgtX) * k;
    p.tgtY += (ty - p.tgtY) * k;
    return [p.tgtX, clamp(p.tgtY, 2, W - 2)];
  }

  private aiTackle(p: Player, dt: number) {
    const o = this.ball.owner;
    if (!o || o.team === p.team || p.tackleT > 0) return;
    if (o.isKeeper && o.hold > 0) return;
    if (p.dist(o.x, o.y) > 1.25) return;
    if (rand() < dt * (o.human ? 0.9 : 1.7) * (p.skills.tackling / 80)) this.tackle(p, o);
  }

  private tackle(p: Player, o: Player) {
    p.tackleT = 0.8;
    const chance = clamp(0.3 + p.skills.tackling / 220 - o.skills.pace / 500 + (o.charging ? 0.1 : 0) + (p.human ? 0.2 : 0) - (o.human ? 0.1 : 0), 0.2, 0.9);
    if (rand() < chance) {
      const b = this.ball;
      b.owner = null;
      b.vx = p.fx * 3.5 + o.vx * 0.3 + (rand() - 0.5) * 2;
      b.vy = p.fy * 3.5 + o.vy * 0.3 + (rand() - 0.5) * 2;
      b.vz = 0;
      b.lastTouch = p.team;
      o.stun = 0.45;
      o.cooldown = 0.5;
      o.charging = false;
      p.cooldown = 0;
      sfx.kickSound(0.2);
    } else {
      p.stun = 0.35;
    }
  }

  private ownerAI(p: Player, dt: number) {
    const t = p.team;
    const a = t.dir;
    const gx = t.attackGoalX;
    const toGoal = (gx - p.x) * a;
    const wide = Math.abs(p.y - MID_Y);
    const pr = this.pressure(p);
    p.decideT -= dt;
    if (p.decideT <= 0 && p.cooldown <= 0) {
      p.decideT = 0.15 + rand() * 0.2;
      if (toGoal < 25 && wide < 15 && (toGoal < 17 || rand() < 0.2 || pr < 1.8)) {
        this.shoot(p, MID_Y + (rand() * 2 - 1) * (GOAL_HALF - 1.2), 0.55 + rand() * 0.4, false);
        return;
      }
      if (toGoal < 22 && wide >= 15 && rand() < 0.45) {
        this.passTo(p, gx - a * (7 + rand() * 5), MID_Y + (rand() * 2 - 1) * 6, true);
        return;
      }
      const want = pr < 3.2 ? rand() < 0.65 : rand() < 0.07;
      if (want) {
        const best = this.bestPass(p, pr < 2.5);
        if (best && (best.score > 1 || pr < 2)) {
          this.passTo(p, best.t.x + best.t.vx * 0.4, best.t.y + best.t.vy * 0.4, best.d > 28 || best.lane < 1.4);
          return;
        }
      }
    }
    // dribble toward goal, steering away from the nearest opponent and the touchline
    let dx = a;
    let dy = (MID_Y - p.y) * 0.02;
    let near: Player | null = null;
    let nd = 4.5;
    for (const o of t.opp.players) {
      const d = p.dist(o.x, o.y);
      if (d < nd) {
        nd = d;
        near = o;
      }
    }
    if (near) {
      const ox = p.x - near.x;
      const oy = p.y - near.y;
      dy += (oy / (nd || 1)) * 0.9;
      dx += (ox / (nd || 1)) * 0.3;
    }
    if (p.y < 4) dy += 0.6;
    if (p.y > W - 4) dy -= 0.6;
    const l = Math.hypot(dx, dy) || 1;
    const s = p.topSpeed(false, true) * 0.95;
    this.steer(p, (dx / l) * s, (dy / l) * s, dt);
  }

  private keeperAI(p: Player, dt: number) {
    const t = p.team;
    const b = this.ball;
    const gx = t.goalX;
    const dir = t.dir;
    if (p.hold > 0 && b.owner === p) {
      // still on the floor after a diving catch
      p.dive = Math.max(0, p.dive - dt);
      if (p.dive > 0) {
        p.vx *= 0.8;
        p.vy *= 0.8;
        return;
      }
      this.steer(p, 0, 0, dt, false);
      const crowded = p.team.opp.players.some((o) => !o.human && this.inBox(p.team, o.x, o.y));
      // wait (up to a couple of seconds) for the attackers to clear his box
      p.hold -= crowded && p.hold < 0.3 && p.holdWait < 2 ? 0 : dt;
      if (crowded) p.holdWait += dt;
      if (p.hold <= 0) this.keeperDistribute(p);
      return;
    }
    if (p.dive > 0) {
      p.dive -= dt;
      if (p.dive > DIVE_LAND) p.vy = p.diveV;
      else p.vy *= 0.75; // landed
      p.vx *= 0.9;
      if (p.dive <= 0) p.stun = 0.25;
      return;
    }
    let tx = gx + dir * clamp(1 + Math.abs(b.x - gx) * 0.05, 1, 4.5);
    let ty = MID_Y + (b.y - MID_Y) * clamp(0.3 - Math.abs(b.x - gx) * 0.004, 0.08, 0.3);
    let sp = 4.5;
    const incoming = !b.owner && b.vx * dir < -6;
    if (incoming) {
      // where the ball will cross the keeper's own line, not the goal line
      const tt = (p.x - b.x) / b.vx;
      const tg = (gx - b.x) / b.vx;
      if (tt > -0.05 && tg < 1.4) {
        const yc = b.y + b.vy * Math.max(0, tt);
        const yg = b.y + b.vy * tg;
        if (Math.abs(yg - MID_Y) < GOAL_HALF + 1.5) {
          ty = clamp(yc, MID_Y - GOAL_HALF - 0.5, MID_Y + GOAL_HALF + 0.5);
          tx = p.x;
          sp = 6.5;
          const gap = ty - p.y;
          // go as late as he can still get there, so he meets the ball at full stretch;
          // better keepers get across quicker
          const maxV = (7 + p.skills.keeping / 25) * KEEPER_SCALE;
          const need = (Math.abs(gap) - 0.5) / maxV;
          if (tt < Math.min(0.45, Math.max(0.2, need) + 0.12) && Math.abs(gap) > 0.9 * KEEPER_SCALE && p.ignoreBall <= 0) {
            const fly = clamp(tt, 0.15, 0.45);
            p.diveDir = Math.sign(gap);
            p.diveV = p.diveDir * Math.min(maxV, Math.max(3, (Math.abs(gap) - 0.5) / fly));
            p.dive = fly + DIVE_LAND;
          }
        }
      }
    } else if (!b.owner && this.inBox(t, b.x, b.y) && b.speed < 12) {
      const opp = this.nearestOutfield(t.opp, b.x, b.y);
      if (!opp || p.dist(b.x, b.y) < opp.dist(b.x, b.y) + 2) {
        tx = b.x;
        ty = b.y;
        sp = 6;
      }
    }
    this.moveTo(p, tx, ty, sp, dt);
  }

  private keeperDistribute(p: Player) {
    const best = this.bestPass(p, false);
    p.hold = 0;
    // anyone loitering near him can't charge the clearance down
    for (const o of p.team.opp.players) if (o.dist(p.x, p.y) < 7) o.ignoreBall = Math.max(o.ignoreBall, 0.6);
    if (best && best.d < 30 && best.lane > 2) {
      this.passTo(p, best.t.x, best.t.y, best.d > 22);
    } else {
      const tx = L / 2 + p.team.dir * (5 + rand() * 15);
      this.passTo(p, tx, 10 + rand() * 48, true);
    }
  }

  private inBox(t: Team, x: number, y: number) {
    return Math.abs(x - t.goalX) < BOX_DEPTH && Math.abs(y - MID_Y) < BOX_HALF;
  }

  private aiRestartKick(r: Restart) {
    const p = r.taker;
    const t = r.team;
    switch (r.kind) {
      case 'kickoff': {
        const mate = t.players[6];
        this.passTo(p, mate.x, mate.y, false);
        break;
      }
      case 'throw': {
        let best: Player | null = null;
        let bd = Infinity;
        for (const m of t.players) {
          if (m === p || m.isKeeper) continue;
          const d = m.dist(p.x, p.y);
          if (d < bd) {
            bd = d;
            best = m;
          }
        }
        if (best) {
          const dx = best.x - p.x;
          const dy = best.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = Math.min(14, 4 + d * 0.7);
          this.kickBall(p, (dx / d) * sp, (dy / d) * sp, 3.2, 0.3);
        }
        break;
      }
      case 'corner':
        this.passTo(p, t.attackGoalX - t.dir * (6 + rand() * 6), MID_Y + (rand() * 2 - 1) * 6, true);
        break;
      case 'goalkick':
        this.keeperDistribute(p);
        break;
    }
  }

  // ------------------------------------------------------------------ ball

  private stepBall(dt: number) {
    const b = this.ball;
    if (b.owner) return;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.z > 0 || b.vz > 0) {
      b.vz -= G * dt;
      b.z += b.vz * dt;
      const drag = 1 - 0.1 * dt;
      b.vx *= drag;
      b.vy *= drag;
      if (b.z <= 0) {
        b.z = 0;
        if (b.vz < -1.6) {
          if (b.vz < -3) sfx.bounceSound();
          b.vz = -b.vz * 0.48;
          b.vx *= 0.82;
          b.vy *= 0.82;
        } else b.vz = 0;
      }
    } else {
      const f = Math.exp(-0.85 * dt);
      b.vx *= f;
      b.vy *= f;
      if (b.speed < 0.25) b.vx = b.vy = 0;
    }
    b.roll += b.speed * dt * 3;
  }

  private keepInNet() {
    const b = this.ball;
    const back = b.x < L / 2 ? -1.9 : L + 1.9;
    if ((b.x < L / 2 && b.x < back) || (b.x > L / 2 && b.x > back)) {
      b.x = back;
      b.vx = -b.vx * 0.1;
      b.vy *= 0.5;
    }
    if (b.x < 0 || b.x > L) {
      b.y = clamp(b.y, MID_Y - GOAL_HALF + 0.2, MID_Y + GOAL_HALF - 0.2);
      if (b.z > GOAL_H - 0.3) {
        b.z = GOAL_H - 0.3;
        b.vz = Math.min(0, b.vz);
      }
    }
  }

  private ballContacts() {
    const b = this.ball;
    if (b.owner) return;
    let best: Player | null = null;
    let bestD = Infinity;
    let kind: 'control' | 'header' | 'keeper' = 'control';
    for (const p of this.players) {
      if (p.cooldown > 0 || p.ignoreBall > 0 || (p.stun > 0 && p.dive <= 0)) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (p.isKeeper && this.inBox(p.team, p.x, p.y)) {
        // a diving keeper reaches out with his hands; standing, the ball has to come near him
        const reach = (p.dive > 0 ? 2.2 : 1.25) * KEEPER_SCALE;
        if (d < reach && b.z < 2.7 && d < bestD) {
          best = p;
          bestD = d;
          kind = 'keeper';
        }
        continue;
      }
      if (b.z < 0.9 && d < (b.speed < 12 ? 1.0 : 0.75) && d < bestD) {
        best = p;
        bestD = d;
        kind = 'control';
      } else if (b.z >= 0.9 && b.z < 2.4 && d < 0.9 && d < bestD) {
        best = p;
        bestD = d;
        kind = 'header';
      }
    }
    if (!best) return;
    const p = best;
    if (kind === 'keeper') return this.keeperTouch(p);
    if (kind === 'header') return this.header(p);
    if (b.speed > 21 && rand() < 0.5) {
      // too hot to handle: it deflects off him
      b.vx *= -0.3;
      b.vy = b.vy * 0.3 + (rand() - 0.5) * 5;
      b.vz = 1.5;
      b.lastTouch = p.team;
      p.cooldown = 0.25;
      sfx.bounceSound();
      return;
    }
    b.owner = p;
    b.lastTouch = p.team;
    this.receiver = null;
    p.decideT = 0.1 + rand() * 0.15;
    if (p.team.ctrl && !p.isKeeper) p.team.ctrl.controlled = p;
  }

  private header(p: Player) {
    const t = p.team;
    if (p.human) {
      const c = t.ctrl!;
      if (!(c.input.kick || c.sinceKickPress < 0.4)) return;
      const k = resolveKick(p.fx, p.fy, c.input.dx, c.input.dy);
      const sp = 8 + p.skills.heading / 12;
      this.kickBall(p, k.dx * sp, k.dy * sp, 1, 0.4);
      return;
    }
    if (rand() > 0.45 + p.skills.heading / 200) {
      p.ignoreBall = 0.4;
      return;
    }
    const gx = t.attackGoalX;
    const sp = 8 + p.skills.heading / 12;
    if (Math.abs(gx - p.x) < 20 && Math.abs(p.y - MID_Y) < 14) {
      const ang = Math.atan2(MID_Y + (rand() * 2 - 1) * (GOAL_HALF - 1) - p.y, gx - p.x) + gauss() * 0.08;
      this.kickBall(p, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.6, 0.5);
    } else {
      const ang = Math.atan2((rand() - 0.5) * 1.2, t.dir);
      this.kickBall(p, Math.cos(ang) * sp, Math.sin(ang) * sp, 2.5, 0.4);
    }
  }

  private keeperTouch(p: Player) {
    const b = this.ball;
    const sp = Math.hypot(b.speed, b.vz);
    const catchIt = () => {
      b.owner = p;
      b.lastTouch = p.team;
      p.hold = 1.4;
      p.holdWait = 0;
      // a diving catch: stay down with the ball for a moment
      p.dive = p.dive > 0 ? Math.min(p.dive, DIVE_LAND) + 0.2 : 0;
      p.vy *= 0.3;
      p.stun = 0;
      p.charging = false;
    };
    // a back pass or a gentle ball is simply gathered
    if (sp < 9) return catchIt();
    const chance = clamp(0.45 + p.skills.keeping / 200 - (sp - 12) / 40, 0.1, 0.9);
    if (rand() < chance) {
      if (sp < 20 || rand() < 0.45) return catchIt();
      // parry
      b.vx = Math.abs(b.vx) * 0.3 * p.team.dir;
      b.vy = (rand() - 0.5) * 9;
      b.vz = 2.5;
      b.lastTouch = p.team;
      p.ignoreBall = 0.5;
      sfx.kickSound(0.3);
    } else {
      p.ignoreBall = 0.7;
    }
  }

  private checkOut() {
    const b = this.ball;
    if (this.phase !== 'play') return;
    const last = b.lastTouch ?? this.teams[0];
    if (b.y < -0.15 || b.y > W + 0.15) {
      const team = last.opp;
      const x = clamp(b.x, 1, L - 1);
      // the ball sits on the line (not outside it) so the throw doesn't count as out again
      const y = b.y < 0 ? 0 : W;
      this.deadBall(() => this.startRestart('throw', team, x, y), 'THROW IN');
      return;
    }
    if (b.x < 0 || b.x > L) {
      const end = b.x < 0 ? 0 : L;
      const defending = this.teams.find((t) => t.goalX === end)!;
      const attacking = defending.opp;
      const off = Math.abs(b.y - MID_Y);
      if (off < GOAL_HALF - 0.1 && b.z < GOAL_H - 0.1) return this.goal(attacking);
      const post = off < GOAL_HALF + 0.25 && b.z < GOAL_H + 0.15;
      if (post) {
        b.x = end === 0 ? 0.05 : L - 0.05;
        b.vx = -b.vx * 0.55;
        b.vy += (rand() - 0.5) * 4;
        sfx.postSound();
        this.showBanner('OFF THE WOODWORK!', 1.5);
        return;
      }
      if (last === defending) {
        const y = b.y < MID_Y ? 0.6 : W - 0.6;
        const x = end === 0 ? 0.6 : L - 0.6;
        this.deadBall(() => this.startRestart('corner', attacking, x, y), 'CORNER');
      } else {
        const x = end + defending.dir * 5.5;
        const y = b.y < MID_Y ? MID_Y - 5 : MID_Y + 5;
        this.deadBall(() => this.startRestart('goalkick', defending, x, y), 'GOAL KICK');
      }
    }
  }

  private deadBall(next: () => void, label: string) {
    this.receiver = null;
    this.phase = 'dead';
    this.phaseT = 0;
    this.pending = next;
    this.showBanner(label, 1.2);
    sfx.whistle(false);
  }

  private goal(team: Team) {
    this.receiver = null;
    team.score++;
    this.lastScorer = this.lastKicker && this.lastKicker.team === team ? this.lastKicker : team.players[9];
    this.phase = 'goal';
    this.phaseT = 0;
    this.showBanner('GOAL!', 3);
    sfx.roar();
  }
}
