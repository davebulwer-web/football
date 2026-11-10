// Drawing the stadium, pitch, goals, players, ball and match HUD.

import { Camera, FAR_Y, NEAR_Y, PITCH_L, PITCH_W, project, scaleAt, VH, VW } from './view';
import { ballSprites, KICK, pixelSet, PX_CELL, PX_FOOT, RUN_FRAMES, spriteSet, SPR_H, SPR_W, STAND } from './sprites';
import { drawText } from './text';
import { GOAL_H, GOAL_HALF, MID_Y, type Player } from '../match/entities';
import type { Match } from '../match/match';

const GRASS_A = '#3f8f3a';
const GRASS_B = '#4a9c42';
const GRASS_EDGE = '#357a31';
const LINE = '#e9f2e4';

// ---------------------------------------------------------------- primitives

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, c: string) {
  ctx.fillStyle = c;
  let x = Math.round(x0);
  let y = Math.round(y0);
  const xe = Math.round(x1);
  const ye = Math.round(y1);
  const dx = Math.abs(xe - x);
  const dy = -Math.abs(ye - y);
  const sx = x < xe ? 1 : -1;
  const sy = y < ye ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 2000; i++) {
    if (x >= -1 && x <= VW && y >= -1 && y <= VH) ctx.fillRect(x, y, 1, 1);
    if (x === xe && y === ye) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function wline(ctx: CanvasRenderingContext2D, cam: Camera, a: [number, number], b: [number, number], c = LINE, z0 = 0, z1 = 0) {
  const p = project(cam, a[0], a[1], z0);
  const q = project(cam, b[0], b[1], z1);
  line(ctx, p.x, p.y, q.x, q.y, c);
}

function quad(ctx: CanvasRenderingContext2D, cam: Camera, pts: [number, number, number][], fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach(([x, y, z], i) => {
    const p = project(cam, x, y, z);
    if (i === 0) ctx.moveTo(Math.round(p.x), Math.round(p.y));
    else ctx.lineTo(Math.round(p.x), Math.round(p.y));
  });
  ctx.closePath();
  ctx.fill();
}

function arc(ctx: CanvasRenderingContext2D, cam: Camera, cx: number, cy: number, r: number, a0: number, a1: number) {
  const n = Math.max(8, Math.round(((a1 - a0) / (Math.PI * 2)) * 64));
  let prev: [number, number] | null = null;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const pt: [number, number] = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    if (prev) wline(ctx, cam, prev, pt);
    prev = pt;
  }
}

// ---------------------------------------------------------------- stadium

const SPONSORS = ['PIXELPOP COLA', 'BYTEBURGER', 'RETRO TYRES', 'CHIPTUNE FM', 'GOALPOST BANK', 'SPRITE AIR', '8-BIT BOOTS', 'TOUCHLINE'];
const SPONSOR_COLS: [string, string][] = [
  ['#1b3a8a', '#ffffff'],
  ['#f2f2f2', '#c8202f'],
  ['#202020', '#f2cc1c'],
  ['#c8202f', '#ffffff'],
  ['#f2f2f2', '#1b3a8a'],
  ['#1f7a3a', '#ffffff'],
  ['#f07818', '#202020'],
  ['#5a2a8a', '#ffffff'],
];

let crowdTile: HTMLCanvasElement | null = null;
function getCrowdTile(): HTMLCanvasElement {
  if (crowdTile) return crowdTile;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.fillStyle = '#23262e';
  g.fillRect(0, 0, 96, 48);
  const cols = ['#d8d8d8', '#c8202f', '#1b3a8a', '#f2cc1c', '#f0c39c', '#8a5636', '#ffffff', '#3a3a3a', '#2a7a3a'];
  let s = 12345;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let row = 0; row < 8; row++) {
    const y = row * 6;
    g.fillStyle = row % 2 ? '#2c3039' : '#30343e';
    g.fillRect(0, y + 4, 96, 2);
    for (let x = (row % 2) * 2; x < 96; x += 4) {
      if (r() < 0.12) continue;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.fillRect(x, y + 1, 3, 3);
      g.fillStyle = r() < 0.5 ? '#f0c39c' : '#8a5636';
      g.fillRect(x + 1, y, 1, 1);
    }
  }
  crowdTile = c;
  return c;
}

function drawStadium(ctx: CanvasRenderingContext2D, cam: Camera, excite: number, t: number) {
  // sky / roof
  ctx.fillStyle = '#14161b';
  ctx.fillRect(0, 0, VW, 14);
  ctx.fillStyle = '#5a5f6b';
  ctx.fillRect(0, 12, VW, 2);
  // crowd with parallax and a bounce when excited
  const tile = getCrowdTile();
  const off = -((cam.x * 6) % 96) - 96;
  const bob = excite > 0.3 ? Math.round(Math.abs(Math.sin(t * 14)) * 2) : 0;
  for (let x = off; x < VW; x += 96) {
    ctx.drawImage(tile, x, 14 - bob);
  }
  ctx.fillStyle = '#1c1f26';
  ctx.fillRect(0, 60, VW, 2);
  // advertising boards along the far touchline
  const by = -2.4;
  const segW = 15;
  const top = Math.round(project(cam, 0, by, 0.85).y);
  const bot = Math.round(project(cam, 0, by, 0).y);
  const h = bot - top;
  const s = scaleAt(by);
  const firstSeg = Math.floor((cam.x - VW / 2 / s) / segW) - 1;
  for (let i = firstSeg; i < firstSeg + VW / (segW * s) + 3; i++) {
    const x0 = Math.round(project(cam, i * segW, by).x);
    const x1 = Math.round(project(cam, (i + 1) * segW, by).x);
    if (x1 < 0 || x0 > VW) continue;
    const k = ((i % SPONSORS.length) + SPONSORS.length) % SPONSORS.length;
    const [bg, fg] = SPONSOR_COLS[k];
    ctx.fillStyle = bg;
    ctx.fillRect(x0, top, x1 - x0, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + 1, top, x1 - x0 - 2, h);
    ctx.clip();
    drawText(ctx, SPONSORS[k], (x0 + x1) / 2, top + Math.floor((h - 9) / 2), fg, 'center', 8);
    ctx.restore();
    ctx.fillStyle = '#101010';
    ctx.fillRect(x0, top, 1, h);
  }
  ctx.fillStyle = '#101010';
  ctx.fillRect(0, Math.round(bot), VW, 1);
}

// ---------------------------------------------------------------- pitch

function drawPitch(ctx: CanvasRenderingContext2D, cam: Camera) {
  // surround
  quad(ctx, cam, [
    [-14, -2.4, 0],
    [PITCH_L + 14, -2.4, 0],
    [PITCH_L + 14, PITCH_W + 8, 0],
    [-14, PITCH_W + 8, 0],
  ], GRASS_EDGE);
  // mown stripes
  const n = 18;
  const w = PITCH_L / n;
  for (let i = -2; i < n + 2; i++) {
    quad(ctx, cam, [
      [i * w, -2.4, 0],
      [(i + 1) * w, -2.4, 0],
      [(i + 1) * w, PITCH_W + 8, 0],
      [i * w, PITCH_W + 8, 0],
    ], (i + 100) % 2 ? GRASS_A : GRASS_B);
  }
  const Lx = PITCH_L;
  const Wy = PITCH_W;
  // boundary and halfway
  wline(ctx, cam, [0, 0], [Lx, 0]);
  wline(ctx, cam, [0, Wy], [Lx, Wy]);
  wline(ctx, cam, [0, 0], [0, Wy]);
  wline(ctx, cam, [Lx, 0], [Lx, Wy]);
  wline(ctx, cam, [Lx / 2, 0], [Lx / 2, Wy]);
  arc(ctx, cam, Lx / 2, MID_Y, 9.15, 0, Math.PI * 2);
  spot(ctx, cam, Lx / 2, MID_Y);
  for (const end of [0, Lx]) {
    const d = end === 0 ? 1 : -1;
    // penalty area
    wline(ctx, cam, [end, MID_Y - 20.16], [end + d * 16.5, MID_Y - 20.16]);
    wline(ctx, cam, [end + d * 16.5, MID_Y - 20.16], [end + d * 16.5, MID_Y + 20.16]);
    wline(ctx, cam, [end + d * 16.5, MID_Y + 20.16], [end, MID_Y + 20.16]);
    // goal area
    wline(ctx, cam, [end, MID_Y - 9.16], [end + d * 5.5, MID_Y - 9.16]);
    wline(ctx, cam, [end + d * 5.5, MID_Y - 9.16], [end + d * 5.5, MID_Y + 9.16]);
    wline(ctx, cam, [end + d * 5.5, MID_Y + 9.16], [end, MID_Y + 9.16]);
    spot(ctx, cam, end + d * 11, MID_Y);
    // the D
    const a = Math.acos(5.5 / 9.15);
    if (d > 0) arc(ctx, cam, end + 11, MID_Y, 9.15, -a, a);
    else arc(ctx, cam, end - 11, MID_Y, 9.15, Math.PI - a, Math.PI + a);
    // corner arcs
    arc(ctx, cam, end, 0, 1, d > 0 ? 0 : Math.PI / 2, d > 0 ? Math.PI / 2 : Math.PI);
    arc(ctx, cam, end, Wy, 1, d > 0 ? -Math.PI / 2 : Math.PI, d > 0 ? 0 : (Math.PI * 3) / 2);
  }
}

function spot(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number) {
  const p = project(cam, x, y);
  ctx.fillStyle = LINE;
  ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1);
}

function drawFlags(ctx: CanvasRenderingContext2D, cam: Camera, nearSide: boolean) {
  for (const x of [0, PITCH_L]) {
    const y = nearSide ? PITCH_W : 0;
    const b = project(cam, x, y);
    const t = project(cam, x, y, 0.9);
    line(ctx, b.x, b.y, t.x, t.y, '#f2f2f2');
    ctx.fillStyle = '#f2cc1c';
    ctx.fillRect(Math.round(t.x) + 1, Math.round(t.y), 4, 3);
  }
}

// ---------------------------------------------------------------- goals

function drawGoalBack(ctx: CanvasRenderingContext2D, cam: Camera, end: number) {
  const d = end === 0 ? -1 : 1;
  const back = end + d * 2;
  const y0 = MID_Y - GOAL_HALF;
  const y1 = MID_Y + GOAL_HALF;
  const net = 'rgba(235,240,235,0.55)';
  const netFill = 'rgba(220,230,220,0.12)';
  quad(ctx, cam, [
    [back, y0, 0],
    [back, y1, 0],
    [back, y1, 1.6],
    [back, y0, 1.6],
  ], netFill);
  quad(ctx, cam, [
    [end, y0, GOAL_H],
    [end, y1, GOAL_H],
    [back, y1, 1.6],
    [back, y0, 1.6],
  ], netFill);
  // net mesh: back plane verticals
  for (let y = y0; y <= y1 + 0.01; y += 0.61) wline(ctx, cam, [back, y], [back, y], net, 0, 1.6);
  for (let z = 0; z <= 1.61; z += 0.4) wline(ctx, cam, [back, y0], [back, y1], net, z, z);
  // roof lines
  for (let y = y0; y <= y1 + 0.01; y += 0.61) wline(ctx, cam, [end, y], [back, y], net, GOAL_H, 1.6);
  // far side net
  for (let x = 0; x <= 2.01; x += 0.5) wline(ctx, cam, [end + d * x, y0], [end + d * x, y0], net, 0, GOAL_H - (x / 2) * (GOAL_H - 1.6));
  // far post
  post(ctx, cam, end, y0);
}

function drawGoalFront(ctx: CanvasRenderingContext2D, cam: Camera, end: number) {
  const d = end === 0 ? -1 : 1;
  const y0 = MID_Y - GOAL_HALF;
  const y1 = MID_Y + GOAL_HALF;
  const net = 'rgba(235,240,235,0.55)';
  for (let x = 0; x <= 2.01; x += 0.5) wline(ctx, cam, [end + d * x, y1], [end + d * x, y1], net, 0, GOAL_H - (x / 2) * (GOAL_H - 1.6));
  wline(ctx, cam, [end, y1], [end + d * 2, y1], net, GOAL_H, 1.6);
  post(ctx, cam, end, y1);
  // crossbar
  const a = project(cam, end, y0, GOAL_H);
  const b = project(cam, end, y1, GOAL_H);
  line(ctx, a.x, a.y, b.x, b.y, '#ffffff');
  line(ctx, a.x + 1, a.y, b.x + 1, b.y, '#c9cdd2');
}

function post(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number) {
  const b = project(cam, x, y);
  const t = project(cam, x, y, GOAL_H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(b.x), Math.round(t.y), 1, Math.round(b.y - t.y) + 1);
  ctx.fillStyle = '#c9cdd2';
  ctx.fillRect(Math.round(b.x) + 1, Math.round(t.y), 1, Math.round(b.y - t.y) + 1);
}

// ---------------------------------------------------------------- players and ball

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(Math.round(x - w / 2), Math.round(y) - 1, w, 2);
  ctx.fillRect(Math.round(x - w / 2) + 1, Math.round(y) - 2, w - 2, 1);
}

function drawPlayer(ctx: CanvasRenderingContext2D, cam: Camera, p: Player, m: Match) {
  const s = project(cam, p.x, p.y);
  if (s.x < -20 || s.x > VW + 20) return;
  const kit = p.isKeeper ? p.team.keeperKit : p.team.kit;
  const set = spriteSet(kit, p.def.skin, p.isKeeper);
  shadow(ctx, s.x + 1, s.y, 10);
  if (p.isKeeper && p.dive > 0) {
    const img = p.diveDir > 0 ? set.dive : set.diveL;
    ctx.drawImage(img, Math.round(s.x - SPR_H / 2), Math.round(s.y - SPR_W - 4));
    return;
  }
  const moving = Math.hypot(p.vx, p.vy) > 0.4;
  const stumble = p.stun > 0 && p.dive <= 0 && !p.isKeeper ? 1 : 0;
  const px = pixelSet(kit, p.def.skin);
  let headY: number;
  if (px) {
    // pixellab sprite: pick the row for the facing direction
    const row = (Math.round(Math.atan2(p.fy, p.fx) / (Math.PI / 4)) + 8) % 8;
    let col = moving ? 1 + (Math.floor(p.anim * 1.5) % 6) : 0;
    if (p.kickAnim > 0) col = 3;
    ctx.drawImage(px[row][col], Math.round(s.x - PX_CELL / 2), Math.round(s.y - PX_FOOT + stumble));
    headY = s.y - 28;
  } else {
    let frame = moving ? Math.floor(p.anim) % RUN_FRAMES : STAND;
    if (p.kickAnim > 0) frame = KICK;
    let img: HTMLCanvasElement;
    if (Math.abs(p.fx) >= 0.5) img = p.fx > 0 ? set.side[frame] : set.sideL[frame];
    else img = p.fy > 0 ? set.front[frame] : set.back[frame];
    ctx.drawImage(img, Math.round(s.x - SPR_W / 2), Math.round(s.y - SPR_H + 1 + stumble));
    headY = s.y - SPR_H;
  }
  // controlled player marker and power bar
  const ctrl = p.team.ctrl;
  if (ctrl && ctrl.controlled === p && m.phase !== 'fulltime') {
    const col = ctrl.slot === 0 ? '#ffe14a' : '#4ae0ff';
    const mx = Math.round(s.x);
    const my = Math.round(headY - 4);
    ctx.fillStyle = '#101010';
    ctx.fillRect(mx - 3, my - 1, 7, 4);
    ctx.fillStyle = col;
    ctx.fillRect(mx - 2, my, 5, 1);
    ctx.fillRect(mx - 1, my + 1, 3, 1);
    ctx.fillRect(mx, my + 2, 1, 1);
    if (p.charging) {
      const w = 16;
      const bx = mx - w / 2;
      const byy = Math.round(s.y + 3);
      ctx.fillStyle = '#101010';
      ctx.fillRect(bx - 1, byy - 1, w + 2, 4);
      const fill = Math.round(p.charge * w);
      ctx.fillStyle = p.charge < 0.6 ? '#7be35a' : p.charge < 0.85 ? '#f2cc1c' : '#e8433a';
      ctx.fillRect(bx, byy, fill, 2);
    }
  }
}

function drawBall(ctx: CanvasRenderingContext2D, cam: Camera, m: Match) {
  const b = m.ball;
  const g = project(cam, b.x, b.y);
  const h = project(cam, b.x, b.y, b.z);
  const sw = Math.max(2, 5 - Math.round(b.z * 0.6));
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(Math.round(g.x - sw / 2), Math.round(g.y) - 1, sw, 2);
  const frames = ballSprites();
  const f = frames[Math.floor(b.roll) % frames.length];
  ctx.drawImage(f, Math.round(h.x - 3), Math.round(h.y - 5));
}

// ---------------------------------------------------------------- HUD

function drawHUD(ctx: CanvasRenderingContext2D, m: Match) {
  const y0 = 248;
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, y0 - 2, VW, VH - y0 + 2);
  const [h, a] = m.teams;
  // kit swatches
  ctx.fillStyle = h.kit.shirt;
  ctx.fillRect(8, y0 + 6, 6, 8);
  ctx.fillStyle = a.kit.shirt;
  ctx.fillRect(160, y0 + 6, 6, 8);
  drawText(ctx, h.def.code, 18, y0 + 7, '#ffffff');
  ctx.fillStyle = '#e9e9e9';
  ctx.fillRect(56, y0 + 4, 64, 13);
  drawText(ctx, `${h.score}-${a.score}`, 88, y0 + 7, '#101010', 'center');
  drawText(ctx, a.def.code, 128, y0 + 7, '#ffffff');
  // clock
  const mins = Math.floor(m.minutes);
  const secs = Math.floor((m.minutes - mins) * 60);
  ctx.fillStyle = '#e9e9e9';
  ctx.fillRect(400, y0 + 4, 64, 13);
  drawText(ctx, `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, 432, y0 + 7, '#101010', 'center');
  // name of the player on the ball, or player 1's man
  const p = m.ball.owner ?? m.teams.find((t) => t.ctrl)?.ctrl?.controlled ?? null;
  if (p) {
    drawText(ctx, `${p.def.num} ${p.def.name.toUpperCase()}`, 341, y0 + 7, p.team.kit.shirt === '#202020' ? '#cccccc' : p.team.kit.shirt, 'center', 8);
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, m: Match) {
  if (m.bannerT <= 0 || !m.banner) return;
  const big = m.banner === 'GOAL!' || m.banner.endsWith('TIME');
  const size = big ? 24 : 8;
  const y = big ? 112 : 92;
  if (big) {
    ctx.fillStyle = 'rgba(10,12,16,0.6)';
    ctx.fillRect(0, y - 10, VW, size + 20);
  }
  const col = m.banner === 'GOAL!' && Math.floor(m.phaseT * 6) % 2 ? '#f2cc1c' : '#ffffff';
  drawText(ctx, m.banner, VW / 2, y, col, 'center', size, '#101010');
  if (m.phase === 'goal' && m.lastScorer) {
    const s = m.lastScorer;
    drawText(ctx, `${s.def.name.toUpperCase()} (${s.team.def.code})`, VW / 2, y + 30, '#ffffff', 'center', 8, '#101010');
  }
  if (m.phase === 'fulltime') {
    const [h, a] = m.teams;
    drawText(ctx, `${h.def.name.toUpperCase()} ${h.score}  ${a.def.name.toUpperCase()} ${a.score}`, VW / 2, y + 32, '#ffffff', 'center', 8, '#101010');
    drawText(ctx, 'PRESS KICK FOR MENU', VW / 2, y + 48, '#f2cc1c', 'center', 8, '#101010');
  }
}

/** Little radar strip so you can see the whole pitch. */
function drawRadar(ctx: CanvasRenderingContext2D, m: Match) {
  const w = 84;
  const h = 26;
  const x0 = Math.round(VW / 2 - w / 2);
  const y0 = VH - h - 2;
  ctx.fillStyle = 'rgba(30,90,40,0.85)';
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x0 + w / 2, y0, 1, h);
  const sx = w / PITCH_L;
  const sy = h / PITCH_W;
  for (const p of m.players) {
    ctx.fillStyle = p.team.ctrl?.controlled === p ? '#ffe14a' : p.team.kit.shirt;
    ctx.fillRect(x0 + Math.round(p.x * sx), y0 + Math.round(p.y * sy), 2, 1);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0 + Math.round(m.ball.x * sx), y0 + Math.round(m.ball.y * sy), 1, 1);
}

// ---------------------------------------------------------------- frame

export function drawMatch(ctx: CanvasRenderingContext2D, m: Match, cam: Camera, t: number) {
  ctx.fillStyle = '#14161b';
  ctx.fillRect(0, 0, VW, VH);
  const excite = m.phase === 'goal' ? 1 : 0;
  drawStadium(ctx, cam, excite, t);
  drawPitch(ctx, cam);
  drawFlags(ctx, cam, false);
  drawGoalBack(ctx, cam, 0);
  drawGoalBack(ctx, cam, PITCH_L);

  // depth-sorted players, ball and front goal frames
  type Item = { y: number; draw: () => void };
  const items: Item[] = m.players.map((p) => ({ y: p.y, draw: () => drawPlayer(ctx, cam, p, m) }));
  items.push({ y: m.ball.y, draw: () => drawBall(ctx, cam, m) });
  items.push({ y: MID_Y + GOAL_HALF, draw: () => drawGoalFront(ctx, cam, 0) });
  items.push({ y: MID_Y + GOAL_HALF, draw: () => drawGoalFront(ctx, cam, PITCH_L) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  drawFlags(ctx, cam, true);

  drawHUD(ctx, m);
  drawRadar(ctx, m);
  drawBanner(ctx, m);
}

export { FAR_Y, NEAR_Y };
