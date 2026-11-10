// Screen layout and the tilted side-on projection.
// World units are metres. x runs along the pitch (0..105), y across it
// (0 = far touchline at the top of the screen, 68 = near touchline), z is height.

export const VW = 480;
export const VH = 270;

export const PITCH_L = 105;
export const PITCH_W = 68;

/** Screen y of the far and near touchlines. */
export const FAR_Y = 80;
export const NEAR_Y = 236;
/** Horizontal pixels per metre at the far and near touchlines (gives the tilt). */
export const S_FAR = 8.2;
export const S_NEAR = 11;

const VY = (NEAR_Y - FAR_Y) / PITCH_W;
/** Height exaggeration so goals and lofted balls match the size of the players. */
const Z_SCALE = 1.45;

export class Camera {
  x = PITCH_L / 2;
  follow(targetX: number, dt: number) {
    this.x += (targetX - this.x) * Math.min(1, dt * 3.2);
    const half = VW / 2 / S_NEAR;
    this.x = Math.max(half - 9, Math.min(PITCH_L - half + 9, this.x));
  }
}

export function scaleAt(y: number) {
  return S_FAR + (S_NEAR - S_FAR) * (y / PITCH_W);
}

export interface Pt {
  x: number;
  y: number;
}

export function project(cam: Camera, x: number, y: number, z = 0): Pt {
  const s = scaleAt(y);
  return { x: VW / 2 + (x - cam.x) * s, y: FAR_Y + y * VY - z * s * Z_SCALE };
}
