#!/usr/bin/env python3
"""Pack a pixellab character export into one sprite sheet for the game.

Usage: python3 tools/pack-player.py <export folder> public/sprites/player.png
Rows are the 8 directions (east, south-east, south, south-west, west, north-west,
north, north-east). Column 0 is the standing pose, columns 1-6 the running frames.
"""
import sys
from pathlib import Path
from PIL import Image

DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']
src = Path(sys.argv[1])
out = Path(sys.argv[2])
state = next(p for p in src.iterdir() if p.is_dir())
size = Image.open(state / 'rotations' / 'east.png').size[0]
run = next((state / 'animations').iterdir())
sheet = Image.new('RGBA', (size * 7, size * 8), (0, 0, 0, 0))
for r, d in enumerate(DIRS):
    sheet.alpha_composite(Image.open(state / 'rotations' / f'{d}.png').convert('RGBA'), (0, r * size))
    for f in range(6):
        p = run / d / f'frame_{f:03d}.png'
        sheet.alpha_composite(Image.open(p).convert('RGBA'), ((f + 1) * size, r * size))
out.parent.mkdir(parents=True, exist_ok=True)
sheet.save(out)
print(f'{out}: {sheet.size[0]}x{sheet.size[1]}, cell {size}px')
