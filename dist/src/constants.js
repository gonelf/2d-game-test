const TILE = 32;
const WORLD_W = 60;
const WORLD_H = 40;

// Sentinel for empty cells in map layers
const NO_TILE = -1;

// Map structure: stacked tile layers for rich maps. Every placed tile carries
// a visibility tag deciding which view it exists in (rendering AND collision).
const MAP_LAYER_COUNT = 3;
const MAP_LAYER_NAMES = ['Ground', 'Mid', 'Top'];
const VIS = { ALL: 0, P1: 1, P2: 2, MERGED: 3 };
const VIS_NAMES  = ['ALL', 'P1', 'P2', 'MRG'];
const VIS_COLORS = [0xffffff, 0xe74c3c, 0x3498db, 0x9b59b6];

// Merge-energy tuning: merged mode drains energy, split mode recharges it
const MERGE_DRAIN_SECS    = 10;   // full bar lasts this long while merged
const MERGE_RECHARGE_SECS = 5;    // empty -> full while split
const MERGE_MIN_ENERGY    = 0.25; // minimum energy required to start a merge

// Walkability classes. Layers are scanned top-down per cell:
//   SOLID blocks, FLOOR is walkable and stops the scan (bridge over water),
//   DECO is ignored so walkability falls through to the layer below (flowers
//   over water don't make it crossable).
const WALK_FLOOR = 0;
const WALK_SOLID = 1;
const WALK_DECO  = 2;

// Tile catalogue. Index = frame in assets/tiles.png (built by
// scripts/build_assets.py). Indices 0-9 are stable across old saves —
// append new tiles, never reorder. `color` is the procedural fallback fill
// used when the atlas image fails to load.
const TILE_DEFS = [
  { key: 'GRASS',  name: 'Grass',  walk: WALK_FLOOR, color: 0x4a7c59 },
  { key: 'WATER',  name: 'Water',  walk: WALK_SOLID, color: 0x1a5276 },
  { key: 'WALL',   name: 'Cliff',  walk: WALK_SOLID, color: 0x5d4037 },
  { key: 'BRIDGE', name: 'Bridge', walk: WALK_FLOOR, color: 0x8d6e63 },
  { key: 'GAP',    name: 'Gap',    walk: WALK_SOLID, color: 0x1a5276 }, // special-cased: FLOOR while merged
  { key: 'PATH',   name: 'Dirt',   walk: WALK_FLOOR, color: 0x9e8e6a },
  { key: 'SAND',   name: 'Cobble', walk: WALK_FLOOR, color: 0xc2a96e },
  { key: 'TREE',   name: 'Tree',   walk: WALK_SOLID, color: 0x2e7d32 },
  { key: 'ROCK',   name: 'Rock',   walk: WALK_SOLID, color: 0x9e9e9e },
  { key: 'FLOWER', name: 'Flower', walk: WALK_DECO,  color: 0xe84393 },
  { key: 'GRASS2', name: 'Grass 2', walk: WALK_FLOOR, color: 0x5a8c69 },
  { key: 'BUSH',   name: 'Bush',   walk: WALK_SOLID, color: 0x3a9d3a },
  { key: 'TREE2',  name: 'Sapling', walk: WALK_SOLID, color: 0x4caf50 },
  { key: 'STUMP',  name: 'Stump',  walk: WALK_SOLID, color: 0xc9a86a },
  { key: 'FENCE',  name: 'Fence',  walk: WALK_SOLID, color: 0x8d6e63 },
  { key: 'SIGN',   name: 'Sign',   walk: WALK_SOLID, color: 0xbf9b6e },
  { key: 'LILY',   name: 'Lily',   walk: WALK_SOLID, color: 0x2e86c1 },
  { key: 'WAVES',  name: 'Waves',  walk: WALK_SOLID, color: 0x2e86c1 },
];

const TILE_COUNT = TILE_DEFS.length;
const TILE_NAMES = TILE_DEFS.map(d => d.name);
const TILE_WALK  = TILE_DEFS.map(d => d.walk);

// Tile id lookup, e.g. T.GRASS === 0
const T = {};
TILE_DEFS.forEach((d, i) => { T[d.key] = i; });
