// Placeholder player sprites drawn in code (pixellab art replaces these later).
// Each sprite is 14x22 with a 1px dark outline; feet sit on the bottom row.

import type { Kit } from '../data/teams';

export const SPR_W = 14;
export const SPR_H = 22;

export const SKINS: [string, string][] = [
  ['#f0c39c', '#4a2e18'],
  ['#c68a5c', '#1c120a'],
  ['#8a5636', '#100a06'],
  ['#f2d0b0', '#d8a440'],
];

export type View = 'side' | 'front' | 'back';
export const RUN_FRAMES = 4;
export const STAND = 4;
export const KICK = 5;

export interface SpriteSet {
  side: HTMLCanvasElement[];
  sideL: HTMLCanvasElement[];
  front: HTMLCanvasElement[];
  back: HTMLCanvasElement[];
  dive: HTMLCanvasElement;
  diveL: HTMLCanvasElement;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

type Plot = (x: number, y: number, c: string) => void;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c: HTMLCanvasElement): HTMLCanvasElement {
  // Add a dark outline around every opaque pixel.
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const W = c.width;
  const H = c.height;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
  const out: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) out.push(x, y);
  for (let i = 0; i < out.length; i += 2) {
    const p = (out[i + 1] * W + out[i]) * 4;
    d[p] = 20;
    d[p + 1] = 22;
    d[p + 2] = 26;
    d[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function mirror(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas(src.width, src.height);
  const g = c.getContext('2d')!;
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

function plotter(c: HTMLCanvasElement, ox = 1, oy = 1): Plot {
  const g = c.getContext('2d')!;
  return (x, y, col) => {
    g.fillStyle = col;
    g.fillRect(x + ox, y + oy, 1, 1);
  };
}

function rect(p: Plot, x: number, y: number, w: number, h: number, c: string) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p(x + i, y + j, c);
}

// Leg foot offsets [front, back] for run frames, stand, kick.
const LEGS: [number, number][] = [
  [3, -2],
  [1, 0],
  [-2, 3],
  [0, 1],
  [1, -1],
  [4, -1],
];

function drawLeg(p: Plot, hipX: number, off: number, skin: string, sock: string, boot: string, lift = 0) {
  for (let row = 13; row <= 17 - lift; row++) {
    const x = Math.round(hipX + (off * (row - 13)) / 5);
    const col = row <= 14 ? skin : sock;
    p(x, row, col);
    p(x + 1, row, col);
  }
  const fx = Math.round(hipX + off);
  const by = 18 - lift;
  p(fx, by, boot);
  p(fx + 1, by, boot);
  p(fx + 2, by, boot);
  p(fx, by + 1 > 19 ? 19 : by + 1, boot);
  p(fx + 1, by + 1 > 19 ? 19 : by + 1, boot);
}

function sideFrame(kit: Kit, skin: string, hair: string, f: number, keeper: boolean): HTMLCanvasElement {
  const c = canvas(SPR_W, SPR_H);
  const p = plotter(c);
  const [front, back] = LEGS[f];
  const boot = '#1a1a1a';
  const hand = keeper ? '#f4f4f4' : skin;
  // back leg (shaded) then back arm
  drawLeg(p, 4, back, shade(skin, 0.8), shade(kit.socks, 0.75), boot);
  const swing = f === KICK ? -2 : f === STAND ? 0 : front > 0 ? -1 : front < 0 ? 1 : 0;
  rect(p, 5 - swing, 6, 2, 2, shade(kit.shirt, 0.75));
  rect(p, 5 - swing * 2, 8, 2, 2, shade(hand, 0.85));
  // body
  rect(p, 4, 5, 4, 6, kit.shirt);
  p(7, 5, shade(kit.shirt, 1.15));
  rect(p, 4, 11, 4, 2, kit.shorts);
  // front leg
  drawLeg(p, 5, front, skin, kit.socks, boot, f === KICK ? 2 : 0);
  // head
  rect(p, 5, 1, 4, 4, skin);
  rect(p, 4, 0, 4, 2, hair);
  p(4, 2, hair);
  p(4, 3, hair);
  p(8, 2, '#202020');
  p(5, 5, skin);
  // front arm
  rect(p, 5 + swing, 6, 2, 2, kit.shirt);
  rect(p, 5 + swing * 2, 8, 2, 2, hand);
  return finish(c);
}

function frontBackFrame(kit: Kit, skin: string, hair: string, f: number, facing: boolean, keeper: boolean): HTMLCanvasElement {
  const c = canvas(SPR_W, SPR_H);
  const p = plotter(c);
  const boot = '#1a1a1a';
  const hand = keeper ? '#f4f4f4' : skin;
  const liftL = f === 0 ? 1 : 0;
  const liftR = f === 2 ? 1 : 0;
  const armL = f === 0 ? 1 : f === 2 ? -1 : 0;
  // legs
  for (const [x, lift] of [
    [4, liftL],
    [6, liftR],
  ] as [number, number][]) {
    rect(p, x, 13, 2, 2 - lift, skin);
    rect(p, x, 15 - lift, 2, 3, kit.socks);
    rect(p, x, 18 - lift, 2, 2, boot);
  }
  // body
  rect(p, 3, 5, 6, 6, kit.shirt);
  rect(p, 3, 11, 6, 2, kit.shorts);
  p(6, 12, shade(kit.shorts, 0.7));
  // arms
  rect(p, 2, 5 + armL, 1, 2, kit.shirt);
  rect(p, 2, 7 + armL, 1, 3, hand);
  rect(p, 9, 5 - armL, 1, 2, kit.shirt);
  rect(p, 9, 7 - armL, 1, 3, hand);
  // head
  rect(p, 4, 1, 4, 4, skin);
  if (facing) {
    rect(p, 4, 0, 4, 1, hair);
    p(4, 1, hair);
    p(7, 1, hair);
    p(5, 2, '#202020');
    p(6, 2, '#202020');
  } else {
    rect(p, 4, 0, 4, 3, hair);
    rect(p, 4, 3, 1, 1, hair);
    rect(p, 7, 3, 1, 1, hair);
    // number stripe on the back
    rect(p, 5, 6, 2, 3, shade(kit.shirt, 0.6));
  }
  return finish(c);
}

function diveFrame(kit: Kit, skin: string, hair: string): HTMLCanvasElement {
  // Keeper stretched out horizontally, reaching right.
  const c = canvas(SPR_H, SPR_W);
  const p = plotter(c);
  rect(p, 2, 6, 3, 2, '#1a1a1a'); // boots
  rect(p, 4, 6, 4, 2, kit.socks);
  rect(p, 8, 6, 3, 2, kit.shorts);
  rect(p, 11, 5, 5, 3, kit.shirt);
  rect(p, 16, 4, 3, 3, skin);
  rect(p, 16, 3, 3, 1, hair);
  rect(p, 13, 3, 6, 1, kit.shirt);
  rect(p, 19, 2, 1, 2, '#f4f4f4');
  return finish(c);
}

const setCache = new Map<string, SpriteSet>();

export function spriteSet(kit: Kit, skinIdx: number, keeper: boolean): SpriteSet {
  const key = `${kit.shirt}${kit.shorts}${kit.socks}${skinIdx}${keeper}`;
  const hit = setCache.get(key);
  if (hit) return hit;
  const [skin, hair] = SKINS[skinIdx] ?? SKINS[0];
  const side: HTMLCanvasElement[] = [];
  const front: HTMLCanvasElement[] = [];
  const back: HTMLCanvasElement[] = [];
  for (let f = 0; f < 6; f++) {
    side.push(sideFrame(kit, skin, hair, f, keeper));
    const ff = f === STAND || f === KICK ? 1 : f;
    front.push(frontBackFrame(kit, skin, hair, ff, true, keeper));
    back.push(frontBackFrame(kit, skin, hair, ff, false, keeper));
  }
  const dive = diveFrame(kit, skin, hair);
  const set: SpriteSet = { side, sideL: side.map(mirror), front, back, dive, diveL: mirror(dive) };
  setCache.set(key, set);
  return set;
}

let ballFrames: HTMLCanvasElement[] | null = null;
export function ballSprites(): HTMLCanvasElement[] {
  if (ballFrames) return ballFrames;
  ballFrames = [];
  const dark = [
    [1, 1],
    [2, 1],
    [2, 2],
    [1, 2],
  ];
  for (let f = 0; f < 4; f++) {
    const c = canvas(6, 6);
    const p = plotter(c);
    rect(p, 1, 0, 2, 1, '#ffffff');
    rect(p, 0, 1, 4, 2, '#ffffff');
    rect(p, 1, 3, 2, 1, '#ffffff');
    p(dark[f][0], dark[f][1], '#3a3a3a');
    ballFrames.push(finish(c));
  }
  return ballFrames;
}

// ---------------------------------------------------------------- pixellab sprites
// public/sprites/player.png is a pixellab.ai footballer in a white / blue / red
// reference kit (rows: 8 directions, columns: stand + 6 running frames).
// Kits and skin tones are recoloured here so one sheet serves every team.

export const PX_CELL = 36;
export const PX_FOOT = 32;
let sheet: HTMLImageElement | null = null;

export async function loadPlayerSheet() {
  try {
    const img = new Image();
    img.src = 'sprites/player.png';
    await img.decode();
    sheet = img;
  } catch {
    sheet = null; // fall back to the code-drawn sprites
  }
}

export function hasPixelSprites() {
  return sheet !== null;
}

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const REF_SKIN: [number, number, number] = [237, 182, 168];
const lumOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** 8 directions x 7 frames of recoloured sprites. */
export type PixelSet = HTMLCanvasElement[][];
const pixelCache = new Map<string, PixelSet>();

export function pixelSet(kit: Kit, skinIdx: number): PixelSet | null {
  if (!sheet) return null;
  const key = `${kit.shirt}${kit.shorts}${kit.socks}${skinIdx}`;
  const hit = pixelCache.get(key);
  if (hit) return hit;
  const full = canvas(sheet.width, sheet.height);
  const g = full.getContext('2d')!;
  g.drawImage(sheet, 0, 0);
  const img = g.getImageData(0, 0, full.width, full.height);
  const d = img.data;
  const shirt = hexToRgb(kit.shirt);
  const shorts = hexToRgb(kit.shorts);
  const socks = hexToRgb(kit.socks);
  const [skinHex, hairHex] = SKINS[skinIdx] ?? SKINS[0];
  const skin = hexToRgb(skinHex);
  const hair = hexToRgb(hairHex);
  const blond = lumOf(...hair) > 90;
  const refSkinLum = lumOf(...REF_SKIN);
  const apply = (i: number, target: [number, number, number], ratio: number) => {
    const k = Math.max(0.35, Math.min(1.2, ratio));
    d[i] = Math.min(255, target[0] * k);
    d[i + 1] = Math.min(255, target[1] * k);
    d[i + 2] = Math.min(255, target[2] * k);
  };
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i];
    const gg = d[i + 1];
    const b = d[i + 2];
    const lum = lumOf(r, gg, b);
    const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
    const y = Math.floor(i / 4 / full.width) % PX_CELL;
    if (sat < 34 && lum > 120) apply(i, shirt, lum / 238);
    else if (b > r + 35 && b > gg + 25) apply(i, shorts, lum / 72);
    else if (r > gg + 80 && r > b + 50) apply(i, socks, lum / 98);
    else if (r > gg && r - b > 30 && r - b < 120 && lum > 90) apply(i, skin, lum / refSkinLum);
    else if (blond && y < 15 && lum < 80) apply(i, hair, (lum + 20) / 60);
  }
  g.putImageData(img, 0, 0);
  const set: PixelSet = [];
  for (let row = 0; row < 8; row++) {
    const frames: HTMLCanvasElement[] = [];
    for (let col = 0; col < 7; col++) {
      const c = canvas(PX_CELL, PX_CELL);
      c.getContext('2d')!.drawImage(full, col * PX_CELL, row * PX_CELL, PX_CELL, PX_CELL, 0, 0, PX_CELL, PX_CELL);
      frames.push(c);
    }
    set.push(frames);
  }
  pixelCache.set(key, set);
  return set;
}
