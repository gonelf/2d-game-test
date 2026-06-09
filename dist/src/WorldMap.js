// WorldMap.js — Phaser Tilemap-based world renderer.
class WorldMap {
  constructor(scene) {
    this.scene = scene;

    // Load from localStorage or generate default
    const saved = localStorage.getItem('splitworld-map');
    if (saved) {
      try {
        this.data = JSON.parse(saved);
      } catch (e) {
        this.data = this._generateDefault();
      }
    } else {
      this.data = this._generateDefault();
    }

    this._buildTilemap();
  }

  // ── Default map generation ───────────────────────────────────────────────────

  _generateDefault() {
    const map = [];
    for (let y = 0; y < WORLD_H; y++) {
      map[y] = [];
      for (let x = 0; x < WORLD_W; x++) {
        map[y][x] = this._tileAt(x, y);
      }
    }
    return map;
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

  // ── Tilemap creation ─────────────────────────────────────────────────────────

  _buildTilemap() {
    // Build render data: GAP → WATER so gaps look like water in gameplay
    const renderData = [];
    for (let y = 0; y < WORLD_H; y++) {
      renderData[y] = [];
      for (let x = 0; x < WORLD_W; x++) {
        const t = this.data[y][x];
        renderData[y][x] = (t === T.GAP) ? T.WATER : t;
      }
    }

    this.tilemap = this.scene.make.tilemap({
      data: renderData,
      tileWidth: TILE,
      tileHeight: TILE,
    });

    const tileset = this.tilemap.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
    this.layer = this.tilemap.createLayer(0, tileset, 0, 0);
    this.layer.setDepth(0);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Toggle gap tiles between WATER (split) and BRIDGE (merged).
   */
  setMerged(merged) {
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        if (this.data[y][x] === T.GAP) {
          this.layer.putTileAt(merged ? T.BRIDGE : T.WATER, x, y);
        }
      }
    }
  }

  /**
   * Replace world data with newData, rebuild the tilemap layer.
   */
  reloadMap(newData) {
    this.data = newData;
    this.layer.destroy();
    this.tilemap.destroy();
    this._buildTilemap();
  }

  /**
   * Returns true when the given world-pixel position is walkable.
   */
  isWalkable(wx, wy, merged) {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return false;
    const t = this.data[ty][tx];
    if (t === T.WALL || t === T.WATER) return false;
    if (t === T.GAP && !merged) return false;
    return true;
  }

  /**
   * Persist the current map data to localStorage.
   */
  saveMap() {
    localStorage.setItem('splitworld-map', JSON.stringify(this.data));
  }
}
