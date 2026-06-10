const TILE = 32;
const WORLD_W = 60;
const WORLD_H = 40;
const TILE_COUNT = 7;

// Sentinel for "no override" cells in the per-view layers (p1 / p2 / merged)
const NO_TILE = -1;

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
};
