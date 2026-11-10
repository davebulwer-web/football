// Crisp pixel text: renders with the pixel font, then snaps alpha to on/off and caches.

const FONT = '"Press Start 2P", monospace';
const cache = new Map<string, HTMLCanvasElement>();

function render(str: string, size: number, color: string): HTMLCanvasElement {
  const key = `${size}|${color}|${str}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 400) cache.clear();
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = `${size}px ${FONT}`;
  const w = Math.max(1, Math.ceil(g.measureText(str).width));
  c.width = w;
  c.height = size + 2;
  const g2 = c.getContext('2d')!;
  g2.font = `${size}px ${FONT}`;
  g2.textBaseline = 'top';
  g2.fillStyle = color;
  g2.fillText(str, 0, 1);
  const img = g2.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  g2.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

export type Align = 'left' | 'center' | 'right';

export function textWidth(str: string, size = 8) {
  return render(str, size, '#fff').width;
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  color = '#ffffff',
  align: Align = 'left',
  size = 8,
  shadow: string | null = null,
) {
  if (!str) return;
  const c = render(str, size, color);
  let dx = Math.round(x);
  if (align === 'center') dx = Math.round(x - c.width / 2);
  else if (align === 'right') dx = Math.round(x - c.width);
  if (shadow) ctx.drawImage(render(str, size, shadow), dx + 1, Math.round(y) + 1);
  ctx.drawImage(c, dx, Math.round(y));
}

export async function loadFont() {
  try {
    await Promise.race([
      document.fonts.load(`8px ${FONT}`),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to monospace */
  }
}
