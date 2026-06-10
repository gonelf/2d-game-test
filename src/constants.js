const TILE = 32;
const WORLD_W = 60;
const WORLD_H = 40;
const TILE_COUNT = 10;

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

// Tile types
const T = {
  GRASS:  0,
  WATER:  1,
  WALL:   2,
  BRIDGE: 3,  // always passable
  GAP:    4,  // blocks passage in split mode; passable in merged mode
  PATH:   5,
  SAND:   6,
  TREE:   7,  // blocking prop, transparent background
  ROCK:   8,  // blocking prop, transparent background
  FLOWER: 9,  // passable decoration, transparent background
};

// Walkability classes. Layers are scanned top-down per cell:
//   SOLID blocks, FLOOR is walkable and stops the scan (bridge over water),
//   DECO is ignored so walkability falls through to the layer below (flowers
//   over water don't make it crossable).
const WALK_FLOOR = 0;
const WALK_SOLID = 1;
const WALK_DECO  = 2;

const TILE_WALK = {
  [T.GRASS]:  WALK_FLOOR,
  [T.WATER]:  WALK_SOLID,
  [T.WALL]:   WALK_SOLID,
  [T.BRIDGE]: WALK_FLOOR,
  [T.GAP]:    WALK_SOLID,  // special-cased: FLOOR while merged
  [T.PATH]:   WALK_FLOOR,
  [T.SAND]:   WALK_FLOOR,
  [T.TREE]:   WALK_SOLID,
  [T.ROCK]:   WALK_SOLID,
  [T.FLOWER]: WALK_DECO,
};

// Colours used for procedural tile rendering
const TILE_COLORS = {
  [T.GRASS]:  0x4a7c59,
  [T.WATER]:  0x1a5276,
  [T.WALL]:   0x5d4037,
  [T.BRIDGE]: 0x8d6e63,
  [T.GAP]:    0x1a5276,  // looks like water when split
  [T.PATH]:   0x9e8e6a,
  [T.SAND]:   0xc2a96e,
  [T.TREE]:   0x2e7d32,
  [T.ROCK]:   0x9e9e9e,
  [T.FLOWER]: 0xe84393,
};
