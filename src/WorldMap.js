// Builds the tile data for the world and creates Phaser graphics for it.
class WorldMap {
  constructor(scene) {
    this.scene = scene;
    this.tiles = this._buildMap();

    // Static graphics layer drawn once to a RenderTexture
    this._buildGraphics();
  }

  _buildMap() {
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

    // ── River running vertically through the middle ──
    const midX = Math.floor(WORLD_W / 2);
    if (x === midX || x === midX + 1) {
      // Gap tiles in bridge zone rows 14-17 (the puzzle gap)
      if (y >= 14 && y <= 17) return T.GAP;
      // Normal bridge in rows 5-8 (always passable, not a puzzle)
      if (y >= 5 && y <= 8) return T.BRIDGE;
      return T.WATER;
    }

    // ── Paths leading to the bridge puzzle ──
    if (y >= 14 && y <= 17 && x >= midX - 4 && x <= midX + 5) return T.PATH;

    // ── A small enclosed room on the left side ──
    if (x >= 5 && x <= 12 && (y === 5 || y === 12)) return T.WALL;
    if ((x === 5 || x === 12) && y >= 5 && y <= 12) return T.WALL;
    // Door opening
    if (x === 8 && (y === 5 || y === 12)) return T.PATH;

    // ── Sandy area on right side ──
    if (x >= midX + 4 && x <= midX + 12 && y >= 22 && y <= 30) return T.SAND;

    return T.GRASS;
  }

  _buildGraphics() {
    const { scene } = this;
    const W = WORLD_W * TILE;
    const H = WORLD_H * TILE;

    this.rt = scene.add.renderTexture(0, 0, W, H).setDepth(0);

    const gfx = scene.add.graphics();
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const type = this.tiles[y][x];
        // GAP tiles look like bridge in the base texture; gapGfx overlays
        // water on top in split mode, hiding the bridge until views merge.
        const drawColor = type === T.GAP ? TILE_COLORS[T.BRIDGE] : TILE_COLORS[type];
        gfx.fillStyle(drawColor, 1);
        gfx.fillRect(x * TILE, y * TILE, TILE, TILE);

        // Subtle grid lines on passable tiles
        if (type === T.GRASS || type === T.PATH || type === T.SAND || type === T.GAP) {
          gfx.lineStyle(1, 0x000000, 0.08);
          gfx.strokeRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }
    this.rt.draw(gfx, 0, 0);
    gfx.destroy();

    // Gap overlay graphics — shown in split mode, hidden in merged mode
    this.gapGfx = scene.add.graphics().setDepth(1);
    this._drawGaps(true);
  }

  _drawGaps(show) {
    this.gapGfx.clear();
    if (!show) return;
    this.gapGfx.fillStyle(TILE_COLORS[T.GAP], 1);
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        if (this.tiles[y][x] === T.GAP) {
          this.gapGfx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }
  }

  setMerged(merged) {
    // In merged mode hide the gap overlay so the bridge appears complete
    this._drawGaps(!merged);
  }

  // Returns true if the given world pixel position is walkable
  isWalkable(wx, wy, merged) {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return false;
    const t = this.tiles[ty][tx];
    if (t === T.WALL || t === T.WATER) return false;
    if (t === T.GAP && !merged) return false;
    return true;
  }
}
