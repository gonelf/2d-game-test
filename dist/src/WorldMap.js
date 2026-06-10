// WorldMap.js — multi-view world renderer.
// The world is a shared `base` layer plus three override layers: `p1` and `p2`
// (what each player sees/collides with in split mode) and `merged` (what both
// see while views are merged). Override cells hold NO_TILE where the base
// shows through. The legacy GAP tile still means water-when-split /
// bridge-when-merged on whichever layer it sits.
class WorldMap {
  constructor(scene) {
    this.scene   = scene;
    this._merged = false;
    this._cam1   = null;
    this._cam2   = null;

    // Load from localStorage (legacy or v2 format) or generate default
    const saved = localStorage.getItem('splitworld-map');
    let layers = null;
    if (saved) {
      try {
        layers = WorldMap.normalizeLayers(JSON.parse(saved));
      } catch (e) {
        layers = null;
      }
    }
    this.layers = layers || this._generateDefault();

    this._buildViews();
  }

  // ── Layer data helpers ───────────────────────────────────────────────────────

  static emptyOverrides() {
    const grid = [];
    for (let y = 0; y < WORLD_H; y++) grid[y] = new Array(WORLD_W).fill(NO_TILE);
    return grid;
  }

  /**
   * Accepts legacy data (plain 2D array) or v2 data ({base, p1, p2, merged})
   * and returns a complete layers object. Throws on unrecognised input.
   */
  static normalizeLayers(json) {
    if (Array.isArray(json) && Array.isArray(json[0])) {
      return {
        base:   json.map(r => r.slice()),
        p1:     WorldMap.emptyOverrides(),
        p2:     WorldMap.emptyOverrides(),
        merged: WorldMap.emptyOverrides(),
      };
    }
    if (json && Array.isArray(json.base) && Array.isArray(json.base[0])) {
      const grid = (g) => (Array.isArray(g) && Array.isArray(g[0]))
        ? g.map(r => r.slice())
        : WorldMap.emptyOverrides();
      return { base: json.base.map(r => r.slice()), p1: grid(json.p1), p2: grid(json.p2), merged: grid(json.merged) };
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
    return {
      base,
      p1:     WorldMap.emptyOverrides(),
      p2:     WorldMap.emptyOverrides(),
      merged: WorldMap.emptyOverrides(),
    };
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

  /**
   * Effective tile id for a view ('p1' | 'p2' | 'merged') at tile coords.
   */
  compositeTile(view, tx, ty) {
    const ov = this.layers[view][ty][tx];
    return ov !== NO_TILE ? ov : this.layers.base[ty][tx];
  }

  // GAP renders as water in split views and as a bridge in the merged view
  _renderId(view, t) {
    if (t === T.GAP) return view === 'merged' ? T.BRIDGE : T.WATER;
    return t;
  }

  // ── Tilemap creation ─────────────────────────────────────────────────────────

  _buildView(view) {
    const data = [];
    for (let y = 0; y < WORLD_H; y++) {
      data[y] = [];
      for (let x = 0; x < WORLD_W; x++) {
        data[y][x] = this._renderId(view, this.compositeTile(view, x, y));
      }
    }

    const tilemap = this.scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = tilemap.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
    const layer   = tilemap.createLayer(0, tileset, 0, 0).setDepth(0);
    return { tilemap, layer };
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
   * player's view layer.
   */
  setCameras(cam1, cam2) {
    this._cam1 = cam1;
    this._cam2 = cam2;
    this._applyCameraFilters();
  }

  _applyCameraFilters() {
    if (!this._cam1 || !this._cam2 || !this.views) return;
    this.views.p1.layer.cameraFilter = this._cam2.id; // hidden from P2's camera
    this.views.p2.layer.cameraFilter = this._cam1.id; // hidden from P1's camera
    this.views.merged.layer.cameraFilter = 0;
  }

  _applyVisibility() {
    if (!this.views) return;
    this.views.p1.layer.setVisible(!this._merged);
    this.views.p2.layer.setVisible(!this._merged);
    this.views.merged.layer.setVisible(this._merged);
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
   * Replace world data with a new layers object, rebuild all view layers.
   */
  reloadMap(newLayers) {
    this.layers = newLayers;
    for (const v of Object.values(this.views)) {
      v.layer.destroy();
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

  isTileWalkable(tx, ty, merged, who = 'p1') {
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return false;
    const view = merged ? 'merged' : who;
    const t = this.compositeTile(view, tx, ty);
    if (t === T.WALL || t === T.WATER) return false;
    if (t === T.GAP && view !== 'merged') return false;
    return true;
  }

  /**
   * Persist the current map data to localStorage (v2 format).
   */
  saveMap() {
    localStorage.setItem('splitworld-map', JSON.stringify({ version: 2, ...this.layers }));
  }
}
