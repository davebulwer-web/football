import type { Kit, PlayerDef, Skills, TeamDef } from '../data/teams';
import type { Controls, Scheme } from '../core/input';

export const L = 105;
export const W = 68;
export const MID_Y = W / 2;
/** Goals are drawn wider than real life (7.32m) so they suit the chunky players and the tilted view. */
export const GOAL_HALF = 7;
/** Keepers scale their reach with the goal so wider goals stay fair (1 = a 11m goal). */
export const KEEPER_SCALE = GOAL_HALF / 5.5;
export const GOAL_H = 2.44;
export const BOX_DEPTH = 16.5;
export const BOX_HALF = 20.16;

/** 4-4-2 home positions for a side attacking to the right (x from own goal line). */
export const FORMATION: [number, number][] = [
  [4, 34],
  [20, 10],
  [17, 27],
  [17, 41],
  [20, 58],
  [40, 9],
  [36, 27],
  [36, 41],
  [40, 59],
  [55, 29],
  [55, 40],
];

export class Ball {
  x = L / 2;
  y = MID_Y;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  owner: Player | null = null;
  lastTouch: Team | null = null;
  roll = 0;
  get speed() {
    return Math.hypot(this.vx, this.vy);
  }
  place(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.vx = this.vy = this.vz = 0;
  }
}

export class Controller {
  scheme: Scheme;
  pad: number | null;
  slot: number; // 0 = player 1, 1 = player 2
  controlled: Player | null = null;
  input: Controls = { dx: 0, dy: 0, kick: false, sprint: false, pause: false };
  prevKick = false;
  sinceKickPress = 9;
  switchT = 0;
  constructor(slot: number, scheme: Scheme, pad: number | null) {
    this.slot = slot;
    this.scheme = scheme;
    this.pad = pad;
  }
}

export class Team {
  def: TeamDef;
  kit: Kit;
  keeperKit: Kit;
  side: 0 | 1;
  dir: 1 | -1 = 1;
  players: Player[] = [];
  ctrl: Controller | null = null;
  score = 0;
  constructor(def: TeamDef, kit: Kit, side: 0 | 1) {
    this.def = def;
    this.kit = kit;
    this.keeperKit = def.keeper;
    this.side = side;
  }
  get goalX() {
    return this.dir > 0 ? 0 : L;
  }
  get attackGoalX() {
    return this.dir > 0 ? L : 0;
  }
  opp!: Team;
}

export class Player {
  team: Team;
  idx: number;
  def: PlayerDef;
  isKeeper: boolean;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  fx = 1;
  fy = 0;
  anim = 0;
  kickAnim = 0;
  cooldown = 0;
  stun = 0;
  charging = false;
  charge = 0;
  lockFx = 1;
  lockFy = 0;
  decideT = 0;
  hold = 0;
  holdWait = 0;
  dive = 0;
  diveDir = 0;
  diveV = 0;
  ignoreBall = 0;
  tackleT = 0;
  // organic movement
  settled = false;
  faceT = 0;
  wobX = 0;
  wobY = 0;
  wobT = 0;
  runT = 0;
  runX = 0;
  runY = 0;
  tgtX = NaN;
  tgtY = NaN;
  constructor(team: Team, idx: number, def: PlayerDef) {
    this.team = team;
    this.idx = idx;
    this.def = def;
    this.isKeeper = idx === 0;
  }
  get skills(): Skills {
    return this.def.skills;
  }
  get human() {
    return this.team.ctrl !== null && this.team.ctrl.controlled === this;
  }
  dist(x: number, y: number) {
    return Math.hypot(this.x - x, this.y - y);
  }
  topSpeed(sprint: boolean, withBall: boolean) {
    let s = 5.2 + (this.skills.pace / 100) * 2.2;
    if (sprint) s *= 1.28;
    if (withBall) s *= 0.9;
    return s;
  }
}
