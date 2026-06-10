// WorldMap.js — stacked-layer world renderer with per-tile visibility.
// The map is MAP_LAYER_COUNT stacked tile layers (Ground / Mid / Top); each
// cell holds a tile id (or NO_TILE) plus a visibility tag (VIS.ALL / P1 / P2 /
// MERGED) deciding which view the tile exists in. A view ('p1' | 'p2' |
// 'merged') renders every layer's tiles whose tag matches, and walkability is
// decided by the topmost visible tile (so a bridge on Mid makes water on
// Ground crossable). The legacy GAP tile still means water-when-split /
// bridge-when-merged.
class WorldMap {
  constructor(scene) {
    this.scene   = scene;
    this._merged = false;
    this._cam1   = null;
    this._cam2   = null;

    // Load from localStorage (any historic format) or generate default
    const saved = localStorage.getItem('splitworld-map');
    let mapLayers = null;
    if (saved) {
      try {
        mapLayers = WorldMap.normalize(JSON.parse(saved));
      } catch (e) {
        mapLayers = null;
      }
    }
    this.mapLayers = mapLayers || this._generateDefault();

    this._buildViews();
  }

  // ── Map data helpers ─────────────────────────────────────────────────────────

  static emptyGrid(fill) {
    const grid = [];
    for (let y = 0; y < WORLD_H; y++) grid[y] = new Array(WORLD_W).fill(fill);
    return grid;
  }

  static emptyLayer() {
    return { tiles: WorldMap.emptyGrid(NO_TILE), vis: WorldMap.emptyGrid(VIS.ALL) };
  }

  // Wrap a single full grid as the Ground layer of a fresh stack
  static fromBase(base) {
    const stack = [{ tiles: base.map(r => r.slice()), vis: WorldMap.emptyGrid(VIS.ALL) }];
    while (stack.length < MAP_LAYER_COUNT) stack.push(WorldMap.emptyLayer());
    return stack;
  }

  /**
   * Accepts any historic save format and returns a v3 layer stack:
   *  - v3: {version: 3, layers: [{tiles, vis}, ...]}
   *  - v2: {base, p1, p2, merged} override grids
   *  - v1: plain 2D tile array
   * Throws on unrecognised input.
   */
  static normalize(json) {
    // v3
    if (json && json.version === 3 && Array.isArray(json.layers)) {
      const out = [];
      for (let i = 0; i < MAP_LAYER_COUNT; i++) {
        const l = json.layers[i];
        out.push(l && Array.isArray(l.tiles) && Array.isArray(l.tiles[0])
          ? {
              tiles: l.tiles.map(r => r.slice()),
              vis: (Array.isArray(l.vis) && Array.isArray(l.vis[0]))
                ? l.vis.map(r => r.slice())
                : WorldMap.emptyGrid(VIS.ALL),
            }
          : WorldMap.emptyLayer());
      }
      return out;
    }

    // v1: plain grid
    if (Array.isArray(json) && Array.isArray(json[0])) {
      return WorldMap.fromBase(json);
    }

    // v2: base + per-view override grids → tagged tiles on the upper layers
    if (json && Array.isArray(json.base) && Array.isArray(json.base[0])) {
      const stack = WorldMap.fromBase(json.base);
      const place = (grid, visTag) => {
        if (!Array.isArray(grid) || !Array.isArray(grid[0])) return;
        for (let y = 0; y < WORLD_H; y++) {
          for (let x = 0; x < WORLD_W; x++) {
            const t = grid[y] && grid[y][x];
            if (t === NO_TILE || t == null) continue;
            // First free upper layer; overwrite the top one as a last resort
            const li = stack[1].tiles[y][x] === NO_TILE ? 1 : 2;
            stack[li].tiles[y][x] = t;
            stack[li].vis[y][x]   = visTag;
          }
        }
      };
      place(json.merged, VIS.MERGED);
      place(json.p1, VIS.P1);
      place(json.p2, VIS.P2);
      return stack;
    }

    throw new Error('Unrecognised map data');
  }

  // ── Default map generation ───────────────────────────────────────────────────

  _generateDefault() {
    const base = [];
    for (let y = 0; y < WORLD_H; y++) {
      base[y] = [];
      for (let x = 0; x < WORLD_W; x++) {
        base[y][x] = this._tileAt(x, y);
      }
    }
    const stack = WorldMap.fromBase(base);

    // Scatter props on the Mid layer (visible to everyone)
    const mid = stack[1].tiles;
    const trees   = [[5, 20], [9, 25], [14, 30], [18, 8], [3, 35], [45, 5], [50, 15], [55, 20], [45, 32], [24, 33]];
    const rocks   = [[7, 15], [52, 28], [20, 33], [42, 7]];
    const flowers = [[12, 22], [48, 12], [25, 8], [36, 33], [16, 5], [44, 18]];
    for (const [x, y] of trees)   mid[y][x] = T.TREE;
    for (const [x, y] of rocks)   mid[y][x] = T.ROCK;
    for (const [x, y] of flowers) mid[y][x] = T.FLOWER;

    return stack;
  }

  _tileAt(x, y) {
    // Border walls
    if (x === 0 || x === WORLD_W - 1 || y === 0 || y === WORLD_H - 1) return T.WALL;

    // River running vertically through the middle
    const midX = Math.floor(WORLD_W / 2);
    if (x === midX || x === midX + 1) {
      if (y >= 14 && y <= 17) return T.GAP;
      if (y >= 5  && y <= 8)  return T.BRIDGE;
      return T.WATER;
    }

    // Paths leading to the bridge puzzle
    if (y >= 14 && y <= 17 && x >= midX - 4 && x <= midX + 5) return T.PATH;

    // A small enclosed room on the left side
    if (x >= 5 && x <= 12 && (y === 5 || y === 12)) return T.WALL;
    if ((x === 5 || x === 12) && y >= 5 && y <= 12)  return T.WALL;
    // Door opening
    if (x === 8 && (y === 5 || y === 12)) return T.PATH;

    // Sandy area on right side
    if (x >= midX + 4 && x <= midX + 12 && y >= 22 && y <= 30) return T.SAND;

    return T.GRASS;
  }

  // ── View composition ─────────────────────────────────────────────────────────

  static visibleIn(visTag, view) {
    return visTag === VIS.ALL ||
      (view === 'p1'     && visTag === VIS.P1) ||
      (view === 'p2'     && visTag === VIS.P2) ||
      (view === 'merged' && visTag === VIS.MERGED);
  }

  // GAP renders as water in split views and as a bridge in the merged view
  _renderId(view, t) {
    if (t === T.GAP) return view === 'merged' ? T.BRIDGE : T.WATER;
    return t;
  }

  // ── Tilemap creation ─────────────────────────────────────────────────────────

  _buildView(view) {
    const tilemap = this.scene.make.tilemap({
      tileWidth: TILE, tileHeight: TILE, width: WORLD_W, height: WORLD_H,
    });
    const tileset = tilemap.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);

    const layers = [];
    for (let li = 0; li < MAP_LAYER_COUNT; li++) {
      const layer = tilemap.createBlankLayer(view + '-' + li, tileset, 0, 0).setDepth(li);
      const { tiles, vis } = this.mapLayers[li];
      for (let y = 0; y < WORLD_H; y++) {
        for (let x = 0; x < WORLD_W; x++) {
          const t = tiles[y][x];
          if (t !== NO_TILE && WorldMap.visibleIn(vis[y][x], view)) {
            layer.putTileAt(this._renderId(view, t), x, y);
          }
        }
      }
      layers.push(layer);
    }
    return { tilemap, layers };
  }

  _buildViews() {
    this.views = {
      p1:     this._buildView('p1'),
      p2:     this._buildView('p2'),
      merged: this._buildView('merged'),
    };
    this._applyCameraFilters();
    this._applyVisibility();
  }

  /**
   * Register the two split-screen cameras so each one only renders its
   * player's view layers.
   */
  setCameras(cam1, cam2) {
    this._cam1 = cam1;
    this._cam2 = cam2;
    this._applyCameraFilters();
  }

  _applyCameraFilters() {
    if (!this._cam1 || !this._cam2 || !this.views) return;
    for (const l of this.views.p1.layers)     l.cameraFilter = this._cam2.id; // hidden from P2's camera
    for (const l of this.views.p2.layers)     l.cameraFilter = this._cam1.id; // hidden from P1's camera
    for (const l of this.views.merged.layers) l.cameraFilter = 0;
  }

  _applyVisibility() {
    if (!this.views) return;
    for (const l of this.views.p1.layers)     l.setVisible(!this._merged);
    for (const l of this.views.p2.layers)     l.setVisible(!this._merged);
    for (const l of this.views.merged.layers) l.setVisible(this._merged);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Switch between the split (per-player) views and the merged view.
   */
  setMerged(merged) {
    this._merged = merged;
    this._applyVisibility();
  }

  /**
   * Replace world data with a new layer stack, rebuild all views.
   */
  reloadMap(newLayers) {
    this.mapLayers = newLayers;
    for (const v of Object.values(this.views)) {
      for (const l of v.layers) l.destroy();
      v.tilemap.destroy();
    }
    this._buildViews();
  }

  /**
   * Returns true when the given world-pixel position is walkable for `who`
   * ('p1' | 'p2') in the current mode.
   */
  isWalkable(wx, wy, merged, who = 'p1') {
    return this.isTileWalkable(Math.floor(wx / TILE), Math.floor(wy / TILE), merged, who);
  }

  // Scans the stack top-down: SOLID blocks, FLOOR is walkable and stops the
  // scan, DECO falls through to the layer below. An empty stack is a void.
  isTileWalkable(tx, ty, merged, who = 'p1') {
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return false;
    const view = merged ? 'merged' : who;

    for (let li = MAP_LAYER_COUNT - 1; li >= 0; li--) {
      const t = this.mapLayers[li].tiles[ty][tx];
      if (t === NO_TILE || !WorldMap.visibleIn(this.mapLayers[li].vis[ty][tx], view)) continue;
      if (t === T.GAP) return view === 'merged';
      const cls = TILE_WALK[t];
      if (cls === WALK_SOLID) return false;
      if (cls === WALK_FLOOR) return true;
      // WALK_DECO: keep scanning lower layers
    }
    return false;
  }

  /**
   * Persist the current map data to localStorage (v3 format).
   */
  saveMap() {
    localStorage.setItem('splitworld-map', JSON.stringify({ version: 3, layers: this.mapLayers }));
  }
}
