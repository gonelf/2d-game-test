// CharacterAtlas.js — generates a 128×128 canvas texture 'character' with 16 frames.
// Layout: 4 columns (walk frames) × 4 rows (directions: down/left/right/up).
// Sprites are drawn white so setTint() applies player colour cleanly.
const CharacterAtlas = {
  generate(scene) {
    const FW = 32, FH = 32;
    const COLS = 4; // walk frames per direction
    const ROWS = 4; // directions

    const ct  = scene.textures.createCanvas('character', FW * COLS, FH * ROWS);
    const ctx = ct.getContext('2d');

    // [fx, fy] = unit vector in facing direction
    // Perpendicular [px, py] = [-fy, fx], used for left/right leg spread
    const DIRS = [
      { fx: 0,  fy: 1  }, // row 0: walk-down
      { fx: -1, fy: 0  }, // row 1: walk-left
      { fx: 1,  fy: 0  }, // row 2: walk-right
      { fx: 0,  fy: -1 }, // row 3: walk-up
    ];

    // Per walk-frame: [leftLegSwing, rightLegSwing] — offset along facing dir
    const SWING = [[0, 0], [5, -5], [0, 0], [-5, 5]];
    // Bob (vertical offset on step frames)
    const BOB   = [0, -1, 0, -1];

    for (let row = 0; row < ROWS; row++) {
      const { fx, fy } = DIRS[row];
      const px = -fy, py = fx; // perpendicular (leg spread axis)

      for (let col = 0; col < COLS; col++) {
        const ox = col * FW;      // frame origin x
        const oy = row * FH;      // frame origin y
        const cx = ox + 16;       // frame centre x
        const by = oy + 12;       // body centre y (upper half of frame)
        const bob = BOB[col];
        const [swL, swR] = SWING[col];

        // ── Shadow ──────────────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx, oy + 24, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // ── Legs (two small circles below body) ─────────────────────────────
        const legY  = oy + 21;           // default leg Y centre
        const lLegX = cx + px * 4 + fx * swL;
        const lLegY = legY + py * 4 + fy * swL;
        const rLegX = cx - px * 4 + fx * swR;
        const rLegY = legY - py * 4 + fy * swR;

        ctx.fillStyle = '#cccccc';
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.8;

        ctx.beginPath();
        ctx.arc(lLegX, lLegY, 3.5, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        ctx.beginPath();
        ctx.arc(rLegX, rLegY, 3.5, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // ── Body (white so tint applies) ─────────────────────────────────────
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, by + bob, 10, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // ── Face indicator (dark dot in facing direction) ─────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.arc(cx + fx * 6, by + bob + fy * 6, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ct.refresh();

    // Register frames — frame index = row * 4 + col
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        ct.add(row * COLS + col, 0, col * FW, row * FH, FW, FH);
      }
    }
  },
};
