// EditorScene.js — full-screen tile map editor.
class EditorScene extends Phaser.Scene {
  constructor() {
    super({ key: 'EditorScene' });
  }

  create() {
    const gameScene = this.scene.get('GameScene');
    this.worldMap = gameScene.worldMap;

    // Deep-copy the current map so we can cancel without damage
    this.mapData = this.worldMap.data.map(row => row.slice());

    this.selectedTile = T.GRASS;
    this.activeTool   = 'paint'; // 'paint' | 'fill' | 'erase'
    this._isPainting  = false;

    const SIDEBAR_W = 180;
    this.SIDEBAR_W = SIDEBAR_W;

    this._buildTilemap();
    this._buildGrid();
    this._buildSidebar();
    this._buildHoverRect();
    this._setupCamera(SIDEBAR_W);
    this._setupInput();
  }

  // ── Tilemap ──────────────────────────────────────────────────────────────────

  _buildTilemap() {
    // Show GAP tiles with their GAP frame (bridge+blue overlay) in editor
    const renderData = this.mapData.map(row => row.slice());

    this.editorTilemap = this.make.tilemap({
      data: renderData,
      tileWidth: TILE,
      tileHeight: TILE,
    });

    const tileset = this.editorTilemap.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
    this.layer = this.editorTilemap.createLayer(0, tileset, 0, 0);
    this.layer.setDepth(0);
  }

  // ── Grid overlay ─────────────────────────────────────────────────────────────

  _buildGrid() {
    this.gridGfx = this.add.graphics().setDepth(2).setScrollFactor(1);
    this._redrawGrid();
  }

  _redrawGrid() {
    const g = this.gridGfx;
    g.clear();
    g.lineStyle(1, 0xffffff, 0.06);
    const mapW = WORLD_W * TILE;
    const mapH = WORLD_H * TILE;

    for (let x = 0; x <= WORLD_W; x++) {
      g.lineBetween(x * TILE, 0, x * TILE, mapH);
    }
    for (let y = 0; y <= WORLD_H; y++) {
      g.lineBetween(0, y * TILE, mapW, y * TILE);
    }
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────────

  _buildSidebar() {
    const W = this.scale.width;
    const H = this.scale.height;
    const SB = this.SIDEBAR_W;
    const DEPTH = 50;

    // Background panel
    const bg = this.add.graphics().setScrollFactor(0).setDepth(DEPTH);
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, SB, H);
    bg.lineStyle(1, 0x3a3a5e, 1);
    bg.lineBetween(SB, 0, SB, H);

    // Title
    this.add.text(SB / 2, 12, 'MAP EDITOR', {
      fontSize: '12px', fontFamily: 'monospace', color: '#e0e0ff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 1);

    // Tile palette
    this._buildPalette(SB, DEPTH);

    // Tool buttons
    this._buildToolButtons(SB, DEPTH);

    // Action buttons
    this._buildActionButtons(SB, DEPTH);

    // Help text
    this.add.text(SB / 2, H - 24, 'WASD pan · scroll zoom · E back', {
      fontSize: '9px', fontFamily: 'monospace', color: '#8888aa',
      wordWrap: { width: SB - 10 }, align: 'center',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(DEPTH + 1);
  }

  _buildPalette(SB, DEPTH) {
    const TILE_NAMES = ['Grass', 'Water', 'Wall', 'Bridge', 'Gap', 'Path', 'Sand'];
    const NUM_TILES = 7;
    const COL_W = SB / 2;
    const ROW_H = 52;
    const START_Y = 38;

    this._paletteButtons = [];

    for (let i = 0; i < NUM_TILES; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = col * COL_W + COL_W / 2;
      const cy = START_Y + row * ROW_H + ROW_H / 2;

      // Selection highlight background (initially hidden)
      const sel = this.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
      sel.lineStyle(2, 0xffffff, 1);
      sel.strokeRect(col * COL_W + 3, START_Y + row * ROW_H + 3, COL_W - 6, ROW_H - 6);
      sel.setVisible(i === this.selectedTile);

      // Tile image
      const img = this.add.image(cx, cy - 8, 'tiles', i)
        .setScrollFactor(0)
        .setDepth(DEPTH + 2)
        .setInteractive({ useHandCursor: true });

      // Label
      this.add.text(cx, cy + 12, TILE_NAMES[i], {
        fontSize: '9px', fontFamily: 'monospace', color: '#cccccc',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 2);

      // Hover/click zone (invisible, same area as the cell)
      const zone = this.add.zone(col * COL_W, START_Y + row * ROW_H, COL_W, ROW_H)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true });

      const tileIndex = i;
      zone.on('pointerdown', () => {
        this.selectedTile = tileIndex;
        this._updatePaletteHighlight();
        if (this.activeTool === 'erase') {
          // keep erase active
        }
      });

      this._paletteButtons.push({ sel, img });
    }
  }

  _updatePaletteHighlight() {
    for (let i = 0; i < this._paletteButtons.length; i++) {
      this._paletteButtons[i].sel.setVisible(i === this.selectedTile);
    }
  }

  _buildToolButtons(SB, DEPTH) {
    const tools = ['Paint', 'Fill', 'Erase'];
    const keys  = ['paint', 'fill', 'erase'];
    const BTN_W = SB / 3;
    const BTN_H = 24;
    const Y = 240;

    this._toolBtns = {};

    for (let i = 0; i < tools.length; i++) {
      const x = i * BTN_W;
      const isActive = keys[i] === this.activeTool;

      const bg = this.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
      bg.fillStyle(isActive ? 0x4a4a8a : 0x2a2a4a, 1);
      bg.fillRect(x + 2, Y, BTN_W - 4, BTN_H);

      const label = this.add.text(x + BTN_W / 2, Y + BTN_H / 2, tools[i], {
        fontSize: '10px', fontFamily: 'monospace', color: isActive ? '#ffffff' : '#aaaacc',
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(DEPTH + 2);

      const zone = this.add.zone(x, Y, BTN_W, BTN_H)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true });

      const toolKey = keys[i];
      zone.on('pointerdown', () => {
        this.activeTool = toolKey;
        this._updateToolButtons();
      });

      this._toolBtns[toolKey] = { bg, label, x, y: Y, w: BTN_W, h: BTN_H };
    }
  }

  _updateToolButtons() {
    for (const [key, btn] of Object.entries(this._toolBtns)) {
      const active = key === this.activeTool;
      btn.bg.clear();
      btn.bg.fillStyle(active ? 0x4a4a8a : 0x2a2a4a, 1);
      btn.bg.fillRect(btn.x + 2, btn.y, btn.w - 4, btn.h);
      btn.label.setColor(active ? '#ffffff' : '#aaaacc');
    }
  }

  _buildActionButtons(SB, DEPTH) {
    const H = this.scale.height;
    const actions = [
      { label: 'Save',  color: 0x1a7a3a, textColor: '#aaffaa', action: () => this._save()  },
      { label: 'Reset', color: 0x7a4a1a, textColor: '#ffccaa', action: () => this._reset() },
      { label: 'Back',  color: 0x1a3a7a, textColor: '#aaaaff', action: () => this._back()  },
    ];

    const BTN_H = 28;
    const GAP   = 6;
    const totalH = actions.length * BTN_H + (actions.length - 1) * GAP;
    let startY = H - 80 - totalH;

    for (const act of actions) {
      const bg = this.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
      bg.fillStyle(act.color, 1);
      bg.fillRect(8, startY, SB - 16, BTN_H);

      const label = this.add.text(SB / 2, startY + BTN_H / 2, act.label, {
        fontSize: '12px', fontFamily: 'monospace', color: act.textColor,
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(DEPTH + 2);

      const zone = this.add.zone(8, startY, SB - 16, BTN_H)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerdown', act.action);

      startY += BTN_H + GAP;
    }
  }

  // ── Hover rectangle ──────────────────────────────────────────────────────────

  _buildHoverRect() {
    this.hoverGfx = this.add.graphics().setDepth(5).setScrollFactor(1);
  }

  _updateHoverRect(tx, ty) {
    const g = this.hoverGfx;
    g.clear();
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return;
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokeRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
    g.fillStyle(0xffffff, 0.12);
    g.fillRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
  }

  // ── Camera ───────────────────────────────────────────────────────────────────

  _setupCamera(SIDEBAR_W) {
    const mapW = WORLD_W * TILE;
    const mapH = WORLD_H * TILE;

    this.cameras.main.setBounds(0, 0, mapW, mapH);

    // Start at zoom 1.5 so tiles are large enough to click (~48px each)
    this.cameras.main.setZoom(1.5);
    this.cameras.main.centerOn(mapW / 2, mapH / 2);

    this._panKeys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
  }

  // ── Input ────────────────────────────────────────────────────────────────────

  _setupInput() {
    // Mouse wheel zoom
    this.input.on('wheel', (ptr, objs, dx, dy) => {
      const cam = this.cameras.main;
      const factor = dy > 0 ? 0.9 : 1.1;
      const newZoom = Phaser.Math.Clamp(cam.zoom * factor, 0.25, 2.5);
      cam.setZoom(newZoom);
    });

    // Pointer down
    this.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) {
        this._paintAt(ptr, T.GRASS);
        this._isPainting = false; // right-click is one-shot erase to grass
        return;
      }
      if (ptr.x <= this.SIDEBAR_W) return;

      if (this.activeTool === 'fill') {
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        const tx = Math.floor(wp.x / TILE);
        const ty = Math.floor(wp.y / TILE);
        this._floodFill(tx, ty, this.selectedTile);
      } else {
        this._isPainting = true;
        this._paintAt(ptr, this.activeTool === 'erase' ? T.GRASS : this.selectedTile);
      }
    });

    // Pointer move
    this.input.on('pointermove', (ptr) => {
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const tx = Math.floor(wp.x / TILE);
      const ty = Math.floor(wp.y / TILE);

      if (ptr.x > this.SIDEBAR_W) {
        this._updateHoverRect(tx, ty);
      } else {
        this.hoverGfx.clear();
      }

      if (this._isPainting && ptr.isDown && ptr.x > this.SIDEBAR_W) {
        this._paintAt(ptr, this.activeTool === 'erase' ? T.GRASS : this.selectedTile);
      }
    });

    // Pointer up
    this.input.on('pointerup', () => {
      this._isPainting = false;
    });

    // Keyboard shortcuts
    this.input.keyboard.on('keydown-E',   () => this._back());
    this.input.keyboard.on('keydown-ESC', () => this._back());
  }

  // ── Painting helpers ──────────────────────────────────────────────────────────

  _paintAt(ptr, tileType) {
    const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    const tx = Math.floor(wp.x / TILE);
    const ty = Math.floor(wp.y / TILE);
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return;

    this.layer.putTileAt(tileType, tx, ty);
    this.mapData[ty][tx] = tileType;
  }

  _floodFill(startX, startY, newTile) {
    if (startX < 0 || startY < 0 || startX >= WORLD_W || startY >= WORLD_H) return;
    const oldTile = this.mapData[startY][startX];
    if (oldTile === newTile) return;

    const queue = [[startX, startY]];
    const visited = new Set();
    visited.add(startY * WORLD_W + startX);

    while (queue.length > 0) {
      const [x, y] = queue.shift();
      this.layer.putTileAt(newTile, x, y);
      this.mapData[y][x] = newTile;

      const neighbours = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
        const key = ny * WORLD_W + nx;
        if (visited.has(key)) continue;
        if (this.mapData[ny][nx] !== oldTile) continue;
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  _save() {
    this.worldMap.reloadMap(this.mapData);
    this.worldMap.saveMap();
    this._showToast('Map saved!');
  }

  _reset() {
    // Rebuild default map
    const defaultMap = [];
    for (let y = 0; y < WORLD_H; y++) {
      defaultMap[y] = [];
      for (let x = 0; x < WORLD_W; x++) {
        defaultMap[y][x] = this.worldMap._tileAt(x, y);
      }
    }
    this.mapData = defaultMap;

    // Rebuild editor tilemap layer
    this.layer.destroy();
    this.editorTilemap.destroy();
    this._buildTilemap();
    this._buildGrid();
    this._showToast('Map reset');
  }

  _back() {
    // Save to worldMap before returning
    this.worldMap.reloadMap(this.mapData);
    this.worldMap.saveMap();

    this.layer.destroy();
    this.editorTilemap.destroy();
    this.scene.stop('EditorScene');
    this.scene.resume('GameScene');
    this.scene.resume('UIScene');
  }

  _showToast(msg) {
    const W = this.scale.width;
    const H = this.scale.height;
    const t = this.add.text(W / 2, H - 40, msg, {
      fontSize: '14px', fontFamily: 'monospace', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
      backgroundColor: '#1a1a2e',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(200);

    this.tweens.add({
      targets: t,
      alpha: 0,
      duration: 1500,
      delay: 800,
      onComplete: () => t.destroy(),
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  update(time, delta) {
    const dt = delta / 1000;
    const cam = this.cameras.main;
    const PAN_SPEED = 200 / cam.zoom;
    const keys = this._panKeys;

    if (keys.left.isDown)  cam.scrollX -= PAN_SPEED * dt;
    if (keys.right.isDown) cam.scrollX += PAN_SPEED * dt;
    if (keys.up.isDown)    cam.scrollY -= PAN_SPEED * dt;
    if (keys.down.isDown)  cam.scrollY += PAN_SPEED * dt;

    // Clamp within world bounds
    const mapW = WORLD_W * TILE;
    const mapH = WORLD_H * TILE;
    const visW = this.scale.width  / cam.zoom;
    const visH = this.scale.height / cam.zoom;
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, Math.max(0, mapW - visW));
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, Math.max(0, mapH - visH));
  }
}
