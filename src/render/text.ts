// Crisp pixel text: renders with the pixel font, then snaps alpha to on/off and caches.

const FONT = '"Press Start 2P", monospace';
const cache = new Map<string, HTMLCanvasElement>();

function render(str: string, size: number, color: string): HTMLCanvasElement {
  const key = `${size}|${color}|${str}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 400) cache.clear();
  // Draw one character at a time on whole-pixel steps with a gap between letters,
  // so they never smear into each other at any size.
  const c = document.createElement('canvas');
  const gap = Math.max(1, Math.round(size / 8));
  const step = size + gap;
  const chars = [...str];
  c.width = Math.max(1, chars.length * step - gap);
  c.height = size + 2;
  const g2 = c.getContext('2d')!;
  g2.font = `${size}px ${FONT}`;
  g2.textBaseline = 'top';
  g2.fillStyle = color;
  chars.forEach((ch, i) => g2.fillText(ch, i * step, 1));
  const img = g2.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 128 ? 255 : 0;
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
