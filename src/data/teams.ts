// National sides. Player names are made up; skills are generated from a team rating.

export interface Kit {
  shirt: string;
  shorts: string;
  socks: string;
}

export interface Skills {
  pace: number;
  passing: number;
  shooting: number;
  tackling: number;
  heading: number;
  keeping: number;
}

export interface PlayerDef {
  name: string;
  num: number;
  skills: Skills;
  skin: number;
}

export interface TeamDef {
  name: string;
  code: string;
  rating: number;
  kit: Kit;
  away: Kit;
  keeper: Kit;
  players: PlayerDef[]; // 16; first 11 start, index 0 is the keeper
}

type Pool = 'brit' | 'fr' | 'de' | 'it' | 'es' | 'pt' | 'nl' | 'br' | 'ar' | 'scan' | 'be';

const SURNAMES: Record<Pool, string[]> = {
  brit: ['Ashby', 'Barlow', 'Cotter', 'Dawes', 'Ellison', 'Fenwick', 'Garside', 'Hollins', 'Ibbotson', 'Jessop', 'Kirwan', 'Lowther', 'Marsden', 'Nuttall', 'Oakes', 'Pickering', 'Rudd', 'Shackleton', 'Thwaite', 'Varley'],
  fr: ['Allard', 'Bonnet', 'Carre', 'Dufour', 'Fabre', 'Gautier', 'Hamel', 'Jolivet', 'Lacombe', 'Marchand', 'Noel', 'Perrin', 'Roux', 'Sauvage', 'Tessier', 'Vidal'],
  de: ['Albrecht', 'Brandt', 'Dorn', 'Engel', 'Fuchs', 'Graf', 'Haas', 'Jansen', 'Kessler', 'Lorenz', 'Moser', 'Nolte', 'Ostler', 'Pohl', 'Ritter', 'Seidel'],
  it: ['Amato', 'Bellini', 'Caruso', 'DeLuca', 'Esposito', 'Fontana', 'Galli', 'Lombardi', 'Mancini', 'Neri', 'Orlando', 'Pellegrini', 'Rinaldi', 'Sala', 'Testa', 'Villa'],
  es: ['Alonso', 'Bravo', 'Cano', 'Duran', 'Esteban', 'Flores', 'Gil', 'Herrero', 'Iglesias', 'Lozano', 'Marin', 'Navarro', 'Ortega', 'Pastor', 'Rubio', 'Soler'],
  pt: ['Abreu', 'Barros', 'Cardoso', 'Dias', 'Esteves', 'Faria', 'Gomes', 'Lima', 'Macedo', 'Neves', 'Pinto', 'Quintas', 'Rocha', 'Seixas', 'Tavares', 'Vaz'],
  nl: ['Bakker', 'deBoer', 'Dekker', 'Groot', 'Hendriks', 'Jonker', 'Kuipers', 'Leeuw', 'Mulder', 'Peters', 'Smit', 'Timmer', 'Visser', 'Wouters', 'Zwart', 'Bosman'],
  br: ['Almeida', 'Batista', 'Campos', 'Duarte', 'Freitas', 'Guedes', 'Leite', 'Moura', 'Nunes', 'Paiva', 'Queiroz', 'Ramos', 'Siqueira', 'Teles', 'Vieira', 'Xavier'],
  ar: ['Acosta', 'Benitez', 'Correa', 'Dominguez', 'Escobar', 'Funes', 'Godoy', 'Ibarra', 'Juarez', 'Ledesma', 'Medina', 'Ojeda', 'Paz', 'Quiroga', 'Sosa', 'Vera'],
  scan: ['Aalto', 'Berg', 'Dahl', 'Ek', 'Falk', 'Holm', 'Lind', 'Moberg', 'Nyberg', 'Ostberg', 'Rask', 'Sund', 'Strand', 'Vik', 'Wall', 'Lund'],
  be: ['Claes', 'Dupont', 'Goossens', 'Hermans', 'Janssens', 'Lambert', 'Maes', 'Mertens', 'Peeters', 'Renard', 'Simon', 'Vermeulen', 'Willems', 'Wouters', 'Leclercq', 'Dubois'],
};

interface Seed {
  name: string;
  code: string;
  rating: number;
  pool: Pool;
  kit: [string, string, string];
  away: [string, string, string];
  keeper: [string, string, string];
  skins: number[];
}

const SEEDS: Seed[] = [
  { name: 'England', code: 'ENG', rating: 80, pool: 'brit', kit: ['#f4f4f4', '#1d2a5c', '#f4f4f4'], away: ['#c8202f', '#f4f4f4', '#c8202f'], keeper: ['#e0c020', '#202020', '#e0c020'], skins: [0, 0, 1, 2, 3] },
  { name: 'Scotland', code: 'SCO', rating: 72, pool: 'brit', kit: ['#1c2c6b', '#f4f4f4', '#c8202f'], away: ['#e8d24a', '#1c2c6b', '#e8d24a'], keeper: ['#2c9c4c', '#202020', '#2c9c4c'], skins: [0, 0, 3] },
  { name: 'Wales', code: 'WAL', rating: 70, pool: 'brit', kit: ['#d4202c', '#d4202c', '#d4202c'], away: ['#f4f4f4', '#2a7a3a', '#f4f4f4'], keeper: ['#202020', '#202020', '#202020'], skins: [0, 0, 1, 3] },
  { name: 'N. Ireland', code: 'NIR', rating: 66, pool: 'brit', kit: ['#1f8a3e', '#f4f4f4', '#1f8a3e'], away: ['#f4f4f4', '#1d2a5c', '#f4f4f4'], keeper: ['#d8d8d8', '#202020', '#d8d8d8'], skins: [0, 0, 3] },
  { name: 'Ireland', code: 'IRL', rating: 70, pool: 'brit', kit: ['#2aa04a', '#f4f4f4', '#2aa04a'], away: ['#f4f4f4', '#2aa04a', '#f4f4f4'], keeper: ['#e07020', '#202020', '#e07020'], skins: [0, 0, 1, 3] },
  { name: 'France', code: 'FRA', rating: 85, pool: 'fr', kit: ['#1d3c8c', '#f4f4f4', '#d4202c'], away: ['#f4f4f4', '#1d3c8c', '#f4f4f4'], keeper: ['#2c9c4c', '#202020', '#2c9c4c'], skins: [0, 1, 2, 2, 0] },
  { name: 'Germany', code: 'GER', rating: 84, pool: 'de', kit: ['#f4f4f4', '#202020', '#f4f4f4'], away: ['#2a7a3a', '#f4f4f4', '#2a7a3a'], keeper: ['#e0c020', '#202020', '#e0c020'], skins: [0, 0, 3, 1] },
  { name: 'Italy', code: 'ITA', rating: 84, pool: 'it', kit: ['#1f5fbf', '#f4f4f4', '#1f5fbf'], away: ['#f4f4f4', '#1f5fbf', '#f4f4f4'], keeper: ['#202020', '#202020', '#202020'], skins: [0, 0, 1] },
  { name: 'Spain', code: 'ESP', rating: 85, pool: 'es', kit: ['#c81e2a', '#1d2a5c', '#1d2a5c'], away: ['#f2e8c0', '#c81e2a', '#f2e8c0'], keeper: ['#e0c020', '#202020', '#e0c020'], skins: [0, 1, 0] },
  { name: 'Portugal', code: 'POR', rating: 83, pool: 'pt', kit: ['#8c1428', '#1f6a3a', '#8c1428'], away: ['#f4f4f4', '#f4f4f4', '#f4f4f4'], keeper: ['#e0c020', '#202020', '#e0c020'], skins: [0, 1, 2] },
  { name: 'Netherlands', code: 'NED', rating: 82, pool: 'nl', kit: ['#f07818', '#f4f4f4', '#f07818'], away: ['#1d2a5c', '#1d2a5c', '#1d2a5c'], keeper: ['#2c9c4c', '#202020', '#2c9c4c'], skins: [0, 0, 2, 3] },
  { name: 'Belgium', code: 'BEL', rating: 80, pool: 'be', kit: ['#c81e2a', '#c81e2a', '#c81e2a'], away: ['#f4f4f4', '#f4f4f4', '#f4f4f4'], keeper: ['#e0c020', '#202020', '#e0c020'], skins: [0, 2, 1, 0] },
  { name: 'Denmark', code: 'DEN', rating: 76, pool: 'scan', kit: ['#d01c2a', '#f4f4f4', '#d01c2a'], away: ['#f4f4f4', '#d01c2a', '#f4f4f4'], keeper: ['#202020', '#202020', '#202020'], skins: [0, 3, 0] },
  { name: 'Sweden', code: 'SWE', rating: 75, pool: 'scan', kit: ['#f2cc1c', '#1f4ea0', '#f2cc1c'], away: ['#1f4ea0', '#f2cc1c', '#1f4ea0'], keeper: ['#2c9c4c', '#202020', '#2c9c4c'], skins: [0, 3, 3, 1] },
  { name: 'Brazil', code: 'BRA', rating: 86, pool: 'br', kit: ['#f2d41c', '#1f4ea0', '#f4f4f4'], away: ['#1f4ea0', '#f4f4f4', '#1f4ea0'], keeper: ['#202020', '#202020', '#202020'], skins: [1, 2, 0, 1, 2] },
  { name: 'Argentina', code: 'ARG', rating: 85, pool: 'ar', kit: ['#7ab8e8', '#202020', '#f4f4f4'], away: ['#1d2a5c', '#1d2a5c', '#1d2a5c'], keeper: ['#e0c020', '#202020', '#e0c020'], skins: [0, 1, 0] },
];

// Small deterministic random generator so squads are the same every time.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ROLE_BIAS: Partial<Skills>[] = [
  { keeping: 30, pace: -15, shooting: -40, tackling: -30, passing: -15 }, // GK
  { tackling: 12, heading: 10, shooting: -15 },
  { tackling: 14, heading: 14, shooting: -20, pace: -5 },
  { tackling: 14, heading: 14, shooting: -20, pace: -5 },
  { tackling: 12, heading: 8, shooting: -15 },
  { pace: 10, passing: 8, shooting: -2 },
  { passing: 12, tackling: 5 },
  { passing: 12, shooting: 4 },
  { pace: 10, passing: 8 },
  { shooting: 14, heading: 10, pace: 6, tackling: -15 },
  { shooting: 16, pace: 10, tackling: -15 },
];

function makeSquad(s: Seed, idx: number): PlayerDef[] {
  const r = rng(idx * 7919 + 17);
  const pool = [...SURNAMES[s.pool]];
  const out: PlayerDef[] = [];
  const clamp = (v: number) => Math.max(20, Math.min(99, Math.round(v)));
  for (let i = 0; i < 16; i++) {
    const pick = Math.floor(r() * pool.length);
    const name = pool.splice(pick, 1)[0] ?? `Player${i}`;
    const bias = ROLE_BIAS[i < 11 ? i : i === 11 ? 0 : 1 + ((i - 12) * 3) % 10] ?? {};
    const base = (k: keyof Skills) => clamp(s.rating + (bias[k] ?? 0) + (r() - 0.5) * 16);
    const skills: Skills = {
      pace: base('pace'),
      passing: base('passing'),
      shooting: base('shooting'),
      tackling: base('tackling'),
      heading: base('heading'),
      keeping: i === 0 || i === 11 ? base('keeping') : clamp(15 + r() * 15),
    };
    out.push({ name, num: i + 1, skills, skin: s.skins[Math.floor(r() * s.skins.length)] ?? 0 });
  }
  return out;
}

export const TEAMS: TeamDef[] = SEEDS.map((s, i) => ({
  name: s.name,
  code: s.code,
  rating: s.rating,
  kit: { shirt: s.kit[0], shorts: s.kit[1], socks: s.kit[2] },
  away: { shirt: s.away[0], shorts: s.away[1], socks: s.away[2] },
  keeper: { shirt: s.keeper[0], shorts: s.keeper[1], socks: s.keeper[2] },
  players: makeSquad(s, i),
}));

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colourDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** Away side switches to its second kit when the shirts would be too alike. */
export function pickKits(home: TeamDef, away: TeamDef): [Kit, Kit] {
  const clash = colourDistance(home.kit.shirt, away.kit.shirt) < 120;
  return [home.kit, clash ? away.away : away.kit];
}
