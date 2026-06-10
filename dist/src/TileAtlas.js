// TileAtlas.js — generates a canvas texture named 'tiles', one 32×32 frame per
// tile type. Prop tiles (tree/rock/flower) are drawn on a transparent
// background so the layer underneath shows through.
const TileAtlas = {
  generate(scene) {
    const TILE_W = 32;
    const TILE_H = 32;
    const NUM_TILES = TILE_COUNT;
    const W = TILE_W * NUM_TILES;
    const H = TILE_H;

    // Create canvas texture
    const ct = scene.textures.createCanvas('tiles', W, H);
    const ctx = ct.getContext('2d');

    // Draw each tile type
    this._drawGrass(ctx,  T.GRASS  * TILE_W, 0, TILE_W, TILE_H);
    this._drawWater(ctx,  T.WATER  * TILE_W, 0, TILE_W, TILE_H);
    this._drawWall(ctx,   T.WALL   * TILE_W, 0, TILE_W, TILE_H);
    this._drawBridge(ctx, T.BRIDGE * TILE_W, 0, TILE_W, TILE_H);
    this._drawGap(ctx,    T.GAP    * TILE_W, 0, TILE_W, TILE_H);
    this._drawPath(ctx,   T.PATH   * TILE_W, 0, TILE_W, TILE_H);
    this._drawSand(ctx,   T.SAND   * TILE_W, 0, TILE_W, TILE_H);
    this._drawTree(ctx,   T.TREE   * TILE_W, 0, TILE_W, TILE_H);
    this._drawRock(ctx,   T.ROCK   * TILE_W, 0, TILE_W, TILE_H);
    this._drawFlower(ctx, T.FLOWER * TILE_W, 0, TILE_W, TILE_H);

    ct.refresh();

    // Register named frames so tiles can be referenced by index
    for (let i = 0; i < NUM_TILES; i++) {
      ct.add(i, 0, i * TILE_W, 0, TILE_W, TILE_H);
    }
  },

  // ── Tile drawing helpers ────────────────────────────────────────────────────

  _drawGrass(ctx, ox, oy, w, h) {
    // Base fill
    ctx.fillStyle = '#4a7c59';
    ctx.fillRect(ox, oy, w, h);

    // Darker tufts at fixed positions
    ctx.fillStyle = '#3a6347';
    const tufts = [
      [4, 6], [14, 3], [22, 10], [8, 20], [18, 24], [26, 17], [10, 27],
      [28, 5], [2, 15], [20, 29],
    ];
    for (const [tx, ty] of tufts) {
      ctx.fillRect(ox + tx, oy + ty, 3, 2);
      ctx.fillRect(ox + tx + 1, oy + ty - 1, 1, 1);
    }

    // Subtle grid border
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1);
  },

  _drawWater(ctx, ox, oy, w, h) {
    // Base fill
    ctx.fillStyle = '#1a5276';
    ctx.fillRect(ox, oy, w, h);

    // 3 wavy lines
    ctx.strokeStyle = '#2e86c1';
    ctx.lineWidth = 1.5;
    const waves = [8, 16, 24];
    for (const wy of waves) {
      ctx.beginPath();
      ctx.moveTo(ox + 2, oy + wy);
      ctx.quadraticCurveTo(ox + 8,  oy + wy - 3, ox + 14, oy + wy);
      ctx.quadraticCurveTo(ox + 20, oy + wy + 3, ox + 26, oy + wy);
      ctx.quadraticCurveTo(ox + 29, oy + wy - 1, ox + 30, oy + wy);
      ctx.stroke();
    }
  },

  _drawWall(ctx, ox, oy, w, h) {
    // Base fill (mortar)
    ctx.fillStyle = '#4e342e';
    ctx.fillRect(ox, oy, w, h);

    // Stone block pattern — two rows of staggered bricks
    ctx.fillStyle = '#6d4c41';
    // Row 1 (y 2..13): bricks at x 1..13 and 16..28
    ctx.fillRect(ox + 1,  oy + 2,  13, 11);
    ctx.fillRect(ox + 16, oy + 2,  13, 11);

    // Row 2 (y 16..28): offset bricks
    ctx.fillRect(ox + 8,  oy + 17, 16, 11);
    ctx.fillRect(ox + 1,  oy + 17, 5,  11);
    ctx.fillRect(ox + 26, oy + 17, 5,  11);

    // Highlight edges
    ctx.fillStyle = '#7e5c55';
    ctx.fillRect(ox + 1,  oy + 2,  13, 2);
    ctx.fillRect(ox + 16, oy + 2,  13, 2);
    ctx.fillRect(ox + 8,  oy + 17, 16, 2);
    ctx.fillRect(ox + 1,  oy + 17, 5,  2);
    ctx.fillRect(ox + 26, oy + 17, 5,  2);
  },

  _drawBridge(ctx, ox, oy, w, h) {
    // Base fill
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(ox, oy, w, h);

    // Horizontal planks
    ctx.fillStyle = '#8d6e63';
    for (let py = 1; py < h; py += 6) {
      ctx.fillRect(ox + 1, oy + py, w - 2, 4);
    }

    // Wood grain lines on each plank
    ctx.strokeStyle = '#7a5c52';
    ctx.lineWidth = 0.5;
    for (let py = 1; py < h; py += 6) {
      for (let gx = 4; gx < w - 2; gx += 8) {
        ctx.beginPath();
        ctx.moveTo(ox + gx, oy + py + 1);
        ctx.lineTo(ox + gx + 3, oy + py + 3);
        ctx.stroke();
      }
    }

    // Side rails
    ctx.fillStyle = '#5d3e37';
    ctx.fillRect(ox, oy, 1, h);
    ctx.fillRect(ox + w - 1, oy, 1, h);
  },

  _drawGap(ctx, ox, oy, w, h) {
    // Same as bridge base (so in-editor gap looks distinct from plain water)
    this._drawBridge(ctx, ox, oy, w, h);

    // Blue overlay to mark it as a gap
    ctx.fillStyle = 'rgba(26,82,118,0.5)';
    ctx.fillRect(ox, oy, w, h);

    // Extra wavy line hint
    ctx.strokeStyle = 'rgba(46,134,193,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox + 2, oy + 16);
    ctx.quadraticCurveTo(ox + 10, oy + 12, ox + 16, oy + 16);
    ctx.quadraticCurveTo(ox + 22, oy + 20, ox + 30, oy + 16);
    ctx.stroke();
  },

  _drawPath(ctx, ox, oy, w, h) {
    // Base fill
    ctx.fillStyle = '#9e8e6a';
    ctx.fillRect(ox, oy, w, h);

    // Pebble dots
    const pebbles = [
      [5, 5, 2.5],  [12, 9, 2],  [20, 4, 3],  [27, 8, 2],
      [4, 17, 2],   [14, 21, 2.5], [22, 15, 2], [28, 22, 3],
      [7, 27, 2],   [18, 27, 2],  [25, 29, 2.5],
    ];
    for (const [px, py, r] of pebbles) {
      ctx.fillStyle = '#b8a880';
      ctx.beginPath();
      ctx.arc(ox + px, oy + py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a7a5a';
      ctx.beginPath();
      ctx.arc(ox + px + 0.5, oy + py + 0.5, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle grid border
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1);
  },

  _drawSand(ctx, ox, oy, w, h) {
    // Base fill
    ctx.fillStyle = '#d4ac6e';
    ctx.fillRect(ox, oy, w, h);

    // Wavy ripple lines
    ctx.strokeStyle = '#c49a5e';
    ctx.lineWidth = 1;
    const rows = [6, 13, 20, 27];
    for (const ry of rows) {
      ctx.beginPath();
      ctx.moveTo(ox + 2, oy + ry);
      ctx.quadraticCurveTo(ox + 8,  oy + ry - 2, ox + 14, oy + ry);
      ctx.quadraticCurveTo(ox + 20, oy + ry + 2, ox + 26, oy + ry);
      ctx.quadraticCurveTo(ox + 29, oy + ry - 1, ox + 30, oy + ry);
      ctx.stroke();
    }

    // Light speckle dots
    ctx.fillStyle = '#e0bf88';
    const speckles = [[8,4],[18,8],[6,16],[24,18],[12,25],[22,28],[3,29],[28,11]];
    for (const [sx, sy] of speckles) {
      ctx.fillRect(ox + sx, oy + sy, 2, 1);
    }
  },

  // ── Props (transparent background) ──────────────────────────────────────────

  _drawTree(ctx, ox, oy) {
    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(ox + 16, oy + 28, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(ox + 14, oy + 18, 5, 10);
    ctx.fillStyle = '#5d3e37';
    ctx.fillRect(ox + 14, oy + 18, 2, 10);

    // Canopy
    ctx.fillStyle = '#2e7d32';
    for (const [cx, cy, r] of [[16, 11, 9], [10, 15, 6], [22, 15, 6]]) {
      ctx.beginPath();
      ctx.arc(ox + cx, oy + cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Canopy highlights
    ctx.fillStyle = '#43a047';
    for (const [cx, cy, r] of [[13, 8, 4], [19, 11, 3]]) {
      ctx.beginPath();
      ctx.arc(ox + cx, oy + cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  _drawRock(ctx, ox, oy) {
    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(ox + 16, oy + 26, 11, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Boulder
    ctx.fillStyle = '#9e9e9e';
    ctx.beginPath();
    ctx.ellipse(ox + 16, oy + 18, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Shading and highlight
    ctx.fillStyle = '#757575';
    ctx.beginPath();
    ctx.ellipse(ox + 19, oy + 21, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#bdbdbd';
    ctx.beginPath();
    ctx.ellipse(ox + 12, oy + 14, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  _drawFlower(ctx, ox, oy) {
    const blooms = [
      [8, 9, '#e84393'], [22, 13, '#fdcb6e'], [12, 23, '#e84393'], [25, 25, '#dfe6e9'],
    ];
    for (const [fx, fy, color] of blooms) {
      // Stem
      ctx.strokeStyle = '#2e7d32';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox + fx, oy + fy + 2);
      ctx.lineTo(ox + fx, oy + fy + 6);
      ctx.stroke();

      // Petals
      ctx.fillStyle = color;
      for (const [px, py] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
        ctx.beginPath();
        ctx.arc(ox + fx + px, oy + fy + py, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // Centre
      ctx.fillStyle = '#f9ca24';
      ctx.beginPath();
      ctx.arc(ox + fx, oy + fy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
