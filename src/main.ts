import { initAudio, menuBlip, setCrowd, updateAudio } from './core/audio';
import { endTick, onFirstInput, readControls, readMenu, Repeater } from './core/input';
import { Match, type MatchConfig } from './match/match';
import { drawMatch } from './render/draw';
import { drawText, loadFont } from './render/text';
import { Camera, VH, VW } from './render/view';
import { Menu } from './ui/menu';
import { loadPlayerSheet } from './render/sprites';
import { TEAMS } from './data/teams';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

function fit() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / VW, innerHeight / VH)));
  canvas.style.width = `${VW * s}px`;
  canvas.style.height = `${VH * s}px`;
}
addEventListener('resize', fit);
fit();

onFirstInput(initAudio);

let match: Match | null = null;
const cam = new Camera();
let paused = false;
let pauseSel = 0;
const pauseKey = new Repeater();
const pauseNav = new Repeater();
const pauseFire = new Repeater();
let fullTimeArmed = false;

const menu = new Menu(startMatch);

function startMatch(cfg: MatchConfig) {
  match = new Match(cfg);
  cam.x = match.ball.x;
  paused = false;
  fullTimeArmed = false;
}

function toMenu() {
  match = null;
  paused = false;
  setCrowd(0);
  menu.reset();
}

// Exposed for automated tests and debugging.
(window as unknown as { touchline: object }).touchline = {
  start: (mode: 'cpu' | '1p' | '2p' = 'cpu', halfSeconds = 60) => {
    startMatch({ home: menuTeams()[0], away: menuTeams()[1], mode, halfSeconds });
  },
  get match() {
    return match;
  },
  /** Run the simulation instantly (for testing). */
  sim: (seconds: number) => {
    for (let i = 0; i < seconds * 60 && match; i++) update(1 / 60);
  },
};
function menuTeams() {
  return [TEAMS[menu.home], TEAMS[menu.away]];
}

function update(dt: number) {
  if (!match) {
    menu.update(dt);
    updateAudio(dt);
    return;
  }
  const anyPause = readControls('solo', 0).pause || readControls('none', 1).pause;
  if (pauseKey.tick(anyPause, dt) && match.phase !== 'fulltime') {
    paused = !paused;
    pauseSel = 0;
    menuBlip();
  }
  if (paused) {
    const c = readMenu();
    if (pauseNav.tick(c.dy !== 0, dt)) {
      pauseSel = 1 - pauseSel;
      menuBlip();
    }
    if (pauseFire.tick(c.kick, dt)) {
      if (pauseSel === 0) paused = false;
      else toMenu();
    }
    return;
  }
  match.update(dt);
  const b = match.ball;
  cam.follow(b.x + b.vx * 0.25, dt);
  if (match.phase === 'fulltime' && match.phaseT > 2) {
    const k = readMenu().kick;
    if (!k) fullTimeArmed = true;
    else if (fullTimeArmed) toMenu();
  }
}

let t = 0;
function draw() {
  if (!match) {
    menu.draw(ctx);
    return;
  }
  drawMatch(ctx, match, cam, t);
  if (paused) {
    ctx.fillStyle = 'rgba(8,10,14,0.7)';
    ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, 'PAUSED', VW / 2, 90, '#f2cc1c', 'center', 16);
    ['RESUME', 'QUIT TO MENU'].forEach((s, i) => {
      drawText(ctx, s, VW / 2, 130 + i * 18, i === pauseSel ? '#f2cc1c' : '#ffffff', 'center');
    });
  }
}

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
function frame(now: number) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    update(STEP);
    endTick();
    t += STEP;
    acc -= STEP;
  }
  draw();
  requestAnimationFrame(frame);
}

Promise.all([loadFont(), loadPlayerSheet()]).then(() => requestAnimationFrame(frame));
