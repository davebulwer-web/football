// Placeholder sound effects, all synthesised with the Web Audio API.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let crowdGain: GainNode | null = null;
let crowdTarget = 0.05;

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new AudioContext();
  } catch {
    return;
  }
  master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);

  // Crowd bed: looping filtered noise.
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 3);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 700;
  bp.Q.value = 0.5;
  crowdGain = ctx.createGain();
  crowdGain.gain.value = 0;
  src.connect(bp).connect(crowdGain).connect(master);
  src.start();
}

export function setCrowd(level: number) {
  crowdTarget = level;
}

export function updateAudio(dt: number) {
  if (!ctx || !crowdGain) return;
  const g = crowdGain.gain.value;
  crowdGain.gain.value = g + (crowdTarget - g) * Math.min(1, dt * 2);
}

export function kickSound(power: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(180 + power * 60, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
  g.gain.setValueAtTime(0.35 + power * 0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.16);
}

export function whistle(long = false, count = 1) {
  if (!ctx || !master) return;
  for (let i = 0; i < count; i++) {
    const t = ctx.currentTime + i * (long ? 0.7 : 0.35);
    const dur = long ? 0.55 : 0.22;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 2600;
    lfo.frequency.value = 38;
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(o.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.02);
    g.gain.setValueAtTime(0.06, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur);
    lfo.stop(t + dur);
  }
}

export function bounceSound() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.06);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.09);
}

export function postSound() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = 520;
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.5);
}

export function roar() {
  if (!ctx || !crowdGain) return;
  crowdGain.gain.value = 0.5;
  crowdTarget = 0.06;
}

export function menuBlip(high = false) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = high ? 880 : 440;
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.09);
}
