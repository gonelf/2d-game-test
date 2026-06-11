#!/usr/bin/env python3
"""Builds the game's sprite atlases from the CC0 "Zelda-like tilesets and
sprites" pack by ArMM1998 (https://opengameart.org/content/zelda-like-tilesets-and-sprites).

Inputs  (assets/source/): Overworld.png, Inner.png, character.png
Outputs (assets/):        tiles.png, char-p1.png, char-p2.png

Run from the repo root:  python3 scripts/build_assets.py
Requires pillow.
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC  = os.path.join(ROOT, 'assets', 'source')
OUT  = os.path.join(ROOT, 'assets')

S = 16          # source tile size
TILE = 32       # game tile size

overworld = Image.open(os.path.join(SRC, 'Overworld.png')).convert('RGBA')
inner     = Image.open(os.path.join(SRC, 'Inner.png')).convert('RGBA')
char      = Image.open(os.path.join(SRC, 'character.png')).convert('RGBA')


def grab(sheet, col, row, w=1, h=1):
    """Crop w x h source tiles starting at (col, row)."""
    return sheet.crop((col * S, row * S, (col + w) * S, (row + h) * S))


def at2x(img):
    return img.resize((img.width * 2, img.height * 2), Image.NEAREST)


# ── Tiles ─────────────────────────────────────────────────────────────────────
# Order must match TILE_DEFS in src/constants.js. 16x16 source tiles are
# upscaled 2x; 2x2-tile props are used at native resolution to fit one frame.

def tile_gap():
    """Water with a ghosted bridge — the editor's marker for GAP cells."""
    water  = at2x(grab(overworld, 16, 3))
    bridge = at2x(grab(inner, 2, 4))
    bridge.putalpha(bridge.getchannel('A').point(lambda a: a * 45 // 100))
    water.alpha_composite(bridge)
    return water


def over_water(col, row):
    """Composite a partially-transparent overworld tile over plain water."""
    water = at2x(grab(overworld, 16, 3))
    water.alpha_composite(at2x(grab(overworld, col, row)))
    return water


def centered(img):
    """Center a prop's opaque pixels in a 32x32 frame."""
    box = img.getbbox()
    out = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0))
    if box:
        crop = img.crop(box)
        out.alpha_composite(crop, ((TILE - crop.width) // 2, TILE - crop.height - 1))
    return out


TILE_IMAGES = [
    at2x(grab(overworld, 0, 0)),        #  0 GRASS
    at2x(grab(overworld, 16, 3)),       #  1 WATER
    at2x(grab(overworld, 4, 21)),       #  2 WALL (cliff face)
    at2x(grab(inner, 2, 4)),            #  3 BRIDGE (wood planks)
    tile_gap(),                         #  4 GAP
    at2x(grab(overworld, 1, 30)),       #  5 PATH (dirt)
    at2x(grab(overworld, 13, 15)),      #  6 SAND (tan cobblestone)
    grab(overworld, 5, 16, 2, 2),       #  7 TREE (big bush, native 32px)
    centered(grab(overworld, 4, 1, 2, 2)),   #  8 ROCK (boulder, native 32px)
    at2x(grab(overworld, 0, 8)),        #  9 FLOWER (white flowers)
    at2x(grab(overworld, 0, 9)),        # 10 GRASS2 (tufty grass)
    at2x(grab(overworld, 2, 14)),       # 11 BUSH (round bush)
    centered(at2x(grab(overworld, 0, 14))),  # 12 TREE2 (sapling)
    centered(grab(overworld, 31, 3, 2, 2)),  # 13 STUMP (native 32px)
    at2x(grab(overworld, 3, 17)),       # 14 FENCE
    centered(at2x(grab(overworld, 35, 2))),  # 15 SIGN
    over_water(2, 0),                   # 16 LILY (lily pad on water)
    over_water(0, 1),                   # 17 WAVES (foam over water)
]

atlas = Image.new('RGBA', (TILE * len(TILE_IMAGES), TILE), (0, 0, 0, 0))
for i, img in enumerate(TILE_IMAGES):
    assert img.size == (TILE, TILE), f'tile {i} is {img.size}'
    atlas.paste(img, (i * TILE, 0))
atlas.save(os.path.join(OUT, 'tiles.png'))
print(f'tiles.png: {len(TILE_IMAGES)} frames, {atlas.size}')


# ── Characters ────────────────────────────────────────────────────────────────
# Source walk cycles: 16x32 frames, 4 frames per row. Source rows:
#   0 = down, 2 = up; row 3 is a side view that we mirror for the other side.
# Output layout (matches Player._dirRow): rows 0=down 1=left 2=right 3=up,
# 4 frames each, 32x64 per frame (2x upscale).

FRAME_W, FRAME_H = 16, 32
COLS = 4
SIDE_ROW = 3           # source row used for the side view
SIDE_FACES = 'left'    # which way SIDE_ROW faces; the other side is mirrored


def char_frame(row, col):
    return char.crop((col * FRAME_W, row * FRAME_H,
                      (col + 1) * FRAME_W, (row + 1) * FRAME_H))


def build_char_sheet(recolor=None):
    sheet = Image.new('RGBA', (COLS * FRAME_W * 2, 4 * FRAME_H * 2), (0, 0, 0, 0))
    side = [char_frame(SIDE_ROW, c) for c in range(COLS)]
    rows = {
        0: [char_frame(0, c) for c in range(COLS)],                       # down
        1: side if SIDE_FACES == 'left' else [f.transpose(Image.FLIP_LEFT_RIGHT) for f in side],
        2: [f.transpose(Image.FLIP_LEFT_RIGHT) for f in side] if SIDE_FACES == 'left' else side,
        3: [char_frame(2, c) for c in range(COLS)],                       # up
    }
    for r, frames in rows.items():
        for c, f in enumerate(frames):
            f = at2x(f)
            if recolor:
                f = recolor(f)
            sheet.paste(f, (c * FRAME_W * 2, r * FRAME_H * 2))
    return sheet


def to_blue(img):
    """Swap the red outfit to blue; leaves skin and hair mostly alone."""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a > 0 and r > 110 and (r - g) > 55 and (r - b) > 55:
                px[x, y] = (b, g, r, a)
    return img


build_char_sheet().save(os.path.join(OUT, 'char-p1.png'))
build_char_sheet(to_blue).save(os.path.join(OUT, 'char-p2.png'))
print('char-p1.png / char-p2.png:', COLS * FRAME_W * 2, 'x', 4 * FRAME_H * 2)


# ── Embedded asset data ───────────────────────────────────────────────────────
# src/AssetData.js carries the sheets as base64 data URIs so the game loads
# identically from file://, behind caches, or offline.

import base64

JS_OUT = os.path.join(ROOT, 'src', 'AssetData.js')
lines = [
    '// AssetData.js — generated by scripts/build_assets.py. Do not edit by hand.',
    '// Embedded sprite sheets (base64 data URIs) so the game loads identically',
    '// from file://, behind caches, or offline.',
    'const ASSET_DATA = {',
]
for key, fname in [('tiles', 'tiles.png'), ('charP1', 'char-p1.png'), ('charP2', 'char-p2.png')]:
    with open(os.path.join(OUT, fname), 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    lines.append(f"  {key}: 'data:image/png;base64,{b64}',")
lines.append('};\n')
with open(JS_OUT, 'w') as f:
    f.write('\n'.join(lines))
print('AssetData.js:', os.path.getsize(JS_OUT), 'bytes')
