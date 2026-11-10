#!/usr/bin/env node
// Generates the base footballer sprite with pixellab.ai and saves it to public/sprites/player/.
// Run on a dev machine only:  PIXELLAB_API_KEY=... node tools/pixellab-player.mjs
// The kit is pure white shirt / blue shorts / red socks so the game can recolour it per team.

import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const API = 'https://api.pixellab.ai/v2';
const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('Set PIXELLAB_API_KEY first.');
  process.exit(1);
}
const OUT = process.argv[2] ?? 'public/sprites/player';
const DESCRIPTION =
  process.env.DESCRIPTION ??
  'retro footballer, short dark hair, plain pure white football shirt, pure blue shorts, pure red long socks, black football boots';
const ANIMS = (process.env.ANIMS ?? 'running-6-frames').split(',');

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitJob(id) {
  for (let i = 0; i < 120; i++) {
    const j = await api('GET', `/background-jobs/${id}`);
    if (j.status === 'completed') return j;
    if (j.status === 'failed') throw new Error(`job ${id} failed: ${JSON.stringify(j.last_response).slice(0, 500)}`);
    await sleep(4000);
  }
  throw new Error(`job ${id} timed out`);
}

let characterId = process.env.CHARACTER_ID;
if (!characterId) {
  console.log('Creating character...');
  const c = await api('POST', '/create-character-with-8-directions', {
    description: DESCRIPTION,
    image_size: { width: Number(process.env.SIZE ?? 24), height: Number(process.env.SIZE ?? 24) },
    view: 'low top-down',
    outline: 'single color black outline',
    shading: 'basic shading',
    detail: 'medium detail',
  });
  characterId = c.character_id;
  console.log('character', characterId);
  await waitJob(c.background_job_id);
}

for (const anim of ANIMS) {
  console.log('Animating', anim);
  const a = await api('POST', '/animate-character', {
    character_id: characterId,
    template_animation_id: anim,
    mode: 'template',
  });
  for (const id of a.background_job_ids) await waitJob(id);
}

const ch = await api('GET', `/characters/${characterId}`);
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'character.json'), JSON.stringify(ch, null, 2));
const zip = await fetch(`${API}/characters/${characterId}/zip`, { headers: { Authorization: `Bearer ${KEY}` } });
if (!zip.ok) throw new Error(`zip -> ${zip.status}`);
const zipPath = join(OUT, 'character.zip');
await writeFile(zipPath, Buffer.from(await zip.arrayBuffer()));
execFileSync('unzip', ['-o', zipPath, '-d', OUT], { stdio: 'inherit' });
console.log('Saved to', OUT);
