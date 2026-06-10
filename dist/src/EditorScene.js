// EditorScene.js — full-screen tile map editor.
class EditorScene extends Phaser.Scene {
  constructor() {
    super({ key: 'EditorScene' });
  }

  create() {
    const gameScene = this.scene.get('GameScene');
    this.worldMap = gameScene.worldMap;

    this.mapData = this._cloneLayers(this.worldMap.layers);

    this.selectedTile   = T.GRASS;
    this.activeTool     = 'paint'; // 'paint' | 'fill' | 'erase'
    this.activeLayer    = 'base';  // 'base' | 'p1' | 'p2' | 'merged'
    this._isPainting    = false;
    this._dragStart     = null;
    this._currentStroke = null;
    this._undoStack     = [];
    this._redoStack     = [];
    this._tilesetKey    = 'tiles';

    const SIDEBAR_W = 180;
    this.SIDEBAR_W = SIDEBAR_W;

    // World objects first (main camera will render these)
    this._buildTilemap();
    this._buildGrid();
    this._buildMarkers();
    this._buildHoverRect();

    // Snapshot children before building UI so we can isolate UI objects
    const preUI = new Set(this.children.list);
    this._buildSidebar();
    this._buildHUD();
    this._uiObjs = this.children.list.filter(o => !preUI.has(o));

    this._setupCamera(SIDEBAR_W);
    this._setupInput();
  }

  // ── Layer data helpers ───────────────────────────────────────────────────────

  _cloneLayers(src) {
    return {
      base:   src.base.map(r => r.slice()),
      p1:     src.p1.map(r => r.slice()),
      p2:     src.p2.map(r => r.slice()),
      merged: src.merged.map(r => r.slice()),
    };
  }

  // Tile shown in the editor for the active layer: overrides on top of base
  _compositeAt(tx, ty) {
    if (this.activeLayer !== 'base') {
      const ov = this.mapData[this.activeLayer][ty][tx];
      if (ov !== NO_TILE) return ov;
    }
    return this.mapData.base[ty][tx];
  }

  // What the erase tool / right-click writes on the active layer
  _eraseValue() {
    return this.activeLayer === 'base' ? T.GRASS : NO_TILE;
  }

  // ── Tilemap ──────────────────────────────────────────────────────────────────

  _buildTilemap() {
    const key = this._tilesetKey || 'tiles';
    const renderData = [];
    for (let y = 0; y < WORLD_H; y++) {
      renderData[y] = [];
      for (let x = 0; x < WORLD_W; x++) {
        renderData[y][x] = this._compositeAt(x, y);
      }
    }

    this.editorTilemap = this.make.tilemap({
      data: renderData,
      tileWidth: TILE,
      tileHeight: TILE,
    });

    const tileset = this.editorTilemap.addTilesetImage('tiles', key, TILE, TILE, 0, 0);
    this.layer = this.editorTilemap.createLayer(0, tileset, 0, 0);
    this.layer.setDepth(0);
  }

  // ── Grid overlay ─────────────────────────────────────────────────────────────

  _buildGrid() {
    if (this.gridGfx) this.gridGfx.destroy();
    this.gridGfx = this.add.graphics().setDepth(2).setScrollFactor(1);
    this._redrawGrid();
  }

  _redrawGrid() {
    const g = this.gridGfx;
    g.clear();
    g.lineStyle(1, 0xffffff, 0.15);
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
    const H = this.scale.height;
    const SB = this.SIDEBAR_W;
    const DEPTH = 50;

    const bg = this.add.graphics().setDepth(DEPTH);
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, SB, H);
    bg.lineStyle(1, 0x3a3a5e, 1);
    bg.lineBetween(SB, 0, SB, H);

    this.add.text(SB / 2, 12, 'MAP EDITOR', {
      fontSize: '12px', fontFamily: 'monospace', color: '#e0e0ff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(DEPTH + 1);

    this._buildPalette(SB, DEPTH);
    this._buildToolButtons(SB, DEPTH);
    this._buildLayerButtons(SB, DEPTH);
    this._buildImportButtons(SB, DEPTH);
    this._buildActionButtons(SB, DEPTH);

    this.add.text(SB / 2, H - 14, 'WASD/MMB pan · pinch zoom · 1-4 layer · Ctrl+Z', {
      fontSize: '8px', fontFamily: 'monospace', color: '#8888aa',
      wordWrap: { width: SB - 10 }, align: 'center',
    }).setOrigin(0.5, 1).setDepth(DEPTH + 1);
  }

  _buildPalette(SB, DEPTH) {
    const TILE_NAMES_LOCAL = ['Grass', 'Water', 'Wall', 'Bridge', 'Gap', 'Path', 'Sand'];
    const COL_W  = SB / 2;
    const ROW_H  = 52;
    const START_Y = 38;

    this._paletteButtons = [];

    for (let i = 0; i < TILE_COUNT; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx  = col * COL_W + COL_W / 2;
      const cy  = START_Y + row * ROW_H + ROW_H / 2;

      const sel = this.add.graphics().setDepth(DEPTH + 1);
      sel.lineStyle(2, 0xffffff, 1);
      sel.strokeRect(col * COL_W + 3, START_Y + row * ROW_H + 3, COL_W - 6, ROW_H - 6);
      sel.setVisible(i === this.selectedTile);

      this.add.image(cx, cy - 8, 'tiles', i)
        .setDepth(DEPTH + 2)
        .setInteractive({ useHandCursor: true });

      this.add.text(cx, cy + 12, TILE_NAMES_LOCAL[i], {
        fontSize: '9px', fontFamily: 'monospace', color: '#cccccc',
      }).setOrigin(0.5, 0).setDepth(DEPTH + 2);

      const zone = this.add.zone(col * COL_W, START_Y + row * ROW_H, COL_W, ROW_H)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true });

      const tileIndex = i;
      zone.on('pointerdown', () => {
        this.selectedTile = tileIndex;
        this._updatePaletteHighlight();
      });

      this._paletteButtons.push({ sel });
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
    // Palette: ceil(TILE_COUNT/2) rows × 52px starting at y=38
    const Y     = 38 + Math.ceil(TILE_COUNT / 2) * 52 + 4;

    this._toolBtns = {};

    for (let i = 0; i < tools.length; i++) {
      const x = i * BTN_W;
      const isActive = keys[i] === this.activeTool;

      const btnBg = this.add.graphics().setDepth(DEPTH + 1);
      btnBg.fillStyle(isActive ? 0x4a4a8a : 0x2a2a4a, 1);
      btnBg.fillRect(x + 2, Y, BTN_W - 4, BTN_H);

      const label = this.add.text(x + BTN_W / 2, Y + BTN_H / 2, tools[i], {
        fontSize: '10px', fontFamily: 'monospace', color: isActive ? '#ffffff' : '#aaaacc',
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 2);

      const zone = this.add.zone(x, Y, BTN_W, BTN_H)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true });

      const toolKey = keys[i];
      zone.on('pointerdown', () => {
        this.activeTool = toolKey;
        this._updateToolButtons();
      });

      this._toolBtns[toolKey] = { bg: btnBg, label, x, y: Y, w: BTN_W, h: BTN_H };
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

  _buildLayerButtons(SB, DEPTH) {
    // Positioned just below tool buttons
    const toolsBottom = 38 + Math.ceil(TILE_COUNT / 2) * 52 + 4 + 24;
    const Y0 = toolsBottom + 6;

    this.add.text(SB / 2, Y0, 'VIEW LAYER', {
      fontSize: '9px', fontFamily: 'monospace', color: '#8888aa',
    }).setOrigin(0.5, 0).setDepth(DEPTH + 1);

    const defs = [
      { key: 'base',   label: 'BASE', color: '#dddddd' },
      { key: 'p1',     label: 'P1',   color: '#e74c3c' },
      { key: 'p2',     label: 'P2',   color: '#3498db' },
      { key: 'merged', label: 'MRG',  color: '#9b59b6' },
    ];
    const BTN_W = SB / 4;
    const BTN_H = 20;
    const Y     = Y0 + 12;

    this._layerBtns = {};

    for (let i = 0; i < defs.length; i++) {
      const { key, label, color } = defs[i];
      const x = i * BTN_W;

      const btnBg = this.add.graphics().setDepth(DEPTH + 1);
      const text  = this.add.text(x + BTN_W / 2, Y + BTN_H / 2, label, {
        fontSize: '9px', fontFamily: 'monospace', color,
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 2);

      this.add.zone(x, Y, BTN_W, BTN_H)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this._setLayer(key));

      this._layerBtns[key] = { bg: btnBg, text, x, y: Y, w: BTN_W, h: BTN_H };
    }
    this._updateLayerButtons();
  }

  _updateLayerButtons() {
    if (!this._layerBtns) return;
    for (const [key, btn] of Object.entries(this._layerBtns)) {
      const active = key === this.activeLayer;
      btn.bg.clear();
      btn.bg.fillStyle(active ? 0x4a4a8a : 0x2a2a4a, 1);
      btn.bg.fillRect(btn.x + 2, btn.y, btn.w - 4, btn.h);
      btn.text.setAlpha(active ? 1 : 0.6);
    }
  }

  _buildImportButtons(SB, DEPTH) {
    // Positioned just below the layer buttons
    const layersBottom = 38 + Math.ceil(TILE_COUNT / 2) * 52 + 4 + 24 + 6 + 12 + 20;
    const Y0 = layersBottom + 6;

    // Section label
    this.add.text(SB / 2, Y0, 'IMPORT', {
      fontSize: '9px', fontFamily: 'monospace', color: '#8888aa',
    }).setOrigin(0.5, 0).setDepth(DEPTH + 1);

    const BTN_H = 22;
    const GAP   = 4;
    const imports = [
      { label: 'Tileset PNG', action: () => this._importTileset() },
      { label: 'Map JSON',    action: () => this._importMap()     },
    ];

    let startY = Y0 + 13;
    for (const imp of imports) {
      const btnBg = this.add.graphics().setDepth(DEPTH + 1);
      btnBg.fillStyle(0x2a3a2a, 1);
      btnBg.fillRect(8, startY, SB - 16, BTN_H);

      this.add.text(SB / 2, startY + BTN_H / 2, imp.label, {
        fontSize: '10px', fontFamily: 'monospace', color: '#88cc88',
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 2);

      this.add.zone(8, startY, SB - 16, BTN_H)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', imp.action);

      startY += BTN_H + GAP;
    }
  }

  _buildActionButtons(SB, DEPTH) {
    const H = this.scale.height;
    const actions = [
      { label: 'Save',  color: 0x1a7a3a, textColor: '#aaffaa', action: () => this._save()  },
      { label: 'Reset', color: 0x7a4a1a, textColor: '#ffccaa', action: () => this._reset() },
      { label: 'Back',  color: 0x1a3a7a, textColor: '#aaaaff', action: () => this._back()  },
    ];

    const BTN_H  = 28;
    const GAP    = 6;
    const totalH = actions.length * BTN_H + (actions.length - 1) * GAP;
    let startY   = H - 90 - totalH;

    for (const act of actions) {
      const btnBg = this.add.graphics().setDepth(DEPTH + 1);
      btnBg.fillStyle(act.color, 1);
      btnBg.fillRect(8, startY, SB - 16, BTN_H);

      this.add.text(SB / 2, startY + BTN_H / 2, act.label, {
        fontSize: '12px', fontFamily: 'monospace', color: act.textColor,
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 2);

      this.add.zone(8, startY, SB - 16, BTN_H)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', act.action);

      startY += BTN_H + GAP;
    }
  }

  // ── Override markers ─────────────────────────────────────────────────────────

  _buildMarkers() {
    this.markerGfx = this.add.graphics().setDepth(3).setScrollFactor(1);
    this._redrawMarkers();
  }

  _redrawMarkers() {
    const g = this.markerGfx;
    g.clear();
    const COLORS = { p1: 0xe74c3c, p2: 0x3498db, merged: 0x9b59b6 };

    if (this.activeLayer === 'base') {
      // Corner dots show which cells carry overrides on any view layer
      const corners = { p1: [2, 2], p2: [TILE - 7, 2], merged: [2, TILE - 7] };
      for (const key of ['p1', 'p2', 'merged']) {
        g.fillStyle(COLORS[key], 0.85);
        const [ox, oy] = corners[key];
        const grid = this.mapData[key];
        for (let y = 0; y < WORLD_H; y++) {
          for (let x = 0; x < WORLD_W; x++) {
            if (grid[y][x] !== NO_TILE) g.fillRect(x * TILE + ox, y * TILE + oy, 5, 5);
          }
        }
      }
      return;
    }

    // Active view layer: outline its overridden cells
    g.lineStyle(2, COLORS[this.activeLayer], 0.9);
    const grid = this.mapData[this.activeLayer];
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        if (grid[y][x] !== NO_TILE) g.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
      }
    }
  }

  // ── Layer switching ──────────────────────────────────────────────────────────

  _setLayer(key) {
    if (this.activeLayer === key || this._isPainting) return;
    this.activeLayer = key;
    this._refreshTiles();
    this._redrawMarkers();
    this._updateLayerButtons();
  }

  _refreshTiles() {
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        this.layer.putTileAt(this._compositeAt(x, y), x, y);
      }
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
    g.lineStyle(2, 0xffffff, 0.8);
    g.strokeRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
    g.fillStyle(0xffffff, 0.15);
    g.fillRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
  }

  // ── HUD (tile coords + zoom) ──────────────────────────────────────────────────

  _buildHUD() {
    const W = this.scale.width;
    const H = this.scale.height;
    this._hudText = this.add.text(W - 8, H - 8, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#ccccdd',
      stroke: '#000000', strokeThickness: 2,
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 4, y: 2 },
    }).setOrigin(1, 1).setDepth(60);
  }

  // ── Camera ───────────────────────────────────────────────────────────────────

  _setupCamera(SIDEBAR_W) {
    const mapW = WORLD_W * TILE;
    const mapH = WORLD_H * TILE;
    const W = this.scale.width;
    const H = this.scale.height;

    this.cameras.main.setBounds(0, 0, mapW, mapH);
    this.cameras.main.setZoom(1.5);
    this.cameras.main.centerOn(mapW / 2, mapH / 2);

    // Dedicated UI camera: fixed zoom=1, no scroll — renders sidebar/HUD at true screen coords
    this._uiCam = this.cameras.add(0, 0, W, H, false, 'editor-ui');
    this._uiCam.setZoom(1).setScroll(0, 0);

    // Each camera only sees its own objects
    this._uiCam.ignore([this.layer, this.gridGfx, this.markerGfx, this.hoverGfx]);
    this.cameras.main.ignore(this._uiObjs);

    this._panKeys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
  }

  // ── Input ────────────────────────────────────────────────────────────────────

  _setupInput() {
    // Prevent browser pinch-zoom and page scroll while editor is open
    this._preventWheel = (e) => e.preventDefault();
    this.game.canvas.addEventListener('wheel', this._preventWheel, { passive: false });

    // ── Mouse wheel / trackpad ────────────────────────────────────────────────
    this.input.on('wheel', (ptr, _objs, dx, dy) => {
      const cam = this.cameras.main;
      const ev  = ptr.event;

      // Pinch gesture: browser sets ctrlKey=true for trackpad pinch on all platforms
      if (ev?.ctrlKey) {
        const newZoom = Phaser.Math.Clamp(cam.zoom * Math.pow(0.99, dy), 0.25, 4);
        const wp = cam.getWorldPoint(ptr.x, ptr.y);
        cam.setZoom(newZoom);
        cam.scrollX = wp.x - ptr.x / newZoom;
        cam.scrollY = wp.y - ptr.y / newZoom;
        return;
      }

      // Mouse scroll wheel: line-mode (Firefox) or large pixel delta (Windows)
      const isMouseWheel = ev && (ev.deltaMode === 1 || (ev.deltaMode === 0 && Math.abs(dy) > 50));
      if (isMouseWheel) {
        const newZoom = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.25, 4);
        const wp = cam.getWorldPoint(ptr.x, ptr.y);
        cam.setZoom(newZoom);
        cam.scrollX = wp.x - ptr.x / newZoom;
        cam.scrollY = wp.y - ptr.y / newZoom;
        return;
      }

      // Two-finger scroll (trackpad): pan the map
      const scale = ev?.deltaMode === 1 ? 18 : 1;
      cam.scrollX += (dx * scale) / cam.zoom;
      cam.scrollY += (dy * scale) / cam.zoom;
    });

    // ── Pointer down ──────────────────────────────────────────────────────────
    this.input.on('pointerdown', (ptr) => {
      // Middle-mouse: start drag-pan
      if (ptr.middleButtonDown()) {
        this._dragStart = {
          px: ptr.x, py: ptr.y,
          sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY,
        };
        return;
      }

      // Right-click: erase (to grass on base, clears the override on view layers)
      if (ptr.rightButtonDown()) {
        this._applyTile(ptr, this._eraseValue());
        return;
      }

      if (ptr.x <= this.SIDEBAR_W) return;

      if (this.activeTool === 'fill') {
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        const tx = Math.floor(wp.x / TILE);
        const ty = Math.floor(wp.y / TILE);
        this._floodFill(tx, ty, this.selectedTile);
      } else {
        this._isPainting    = true;
        this._currentStroke = new Map();
        this._applyTile(ptr, this.activeTool === 'erase' ? this._eraseValue() : this.selectedTile);
      }
    });

    // ── Pointer move ──────────────────────────────────────────────────────────
    this.input.on('pointermove', (ptr) => {
      // Middle-mouse drag pan
      if (this._dragStart && ptr.middleButtonDown()) {
        const cam = this.cameras.main;
        cam.scrollX = this._dragStart.sx - (ptr.x - this._dragStart.px) / cam.zoom;
        cam.scrollY = this._dragStart.sy - (ptr.y - this._dragStart.py) / cam.zoom;
      }

      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const tx = Math.floor(wp.x / TILE);
      const ty = Math.floor(wp.y / TILE);

      if (ptr.x > this.SIDEBAR_W) {
        this._updateHoverRect(tx, ty);
        this._hudText.setText(`${tx},${ty}  ${this.cameras.main.zoom.toFixed(2)}x  [${this.activeLayer.toUpperCase()}]`);
      } else {
        this.hoverGfx.clear();
        this._hudText.setText('');
      }

      if (this._isPainting && ptr.isDown && ptr.x > this.SIDEBAR_W) {
        this._applyTile(ptr, this.activeTool === 'erase' ? this._eraseValue() : this.selectedTile);
      }
    });

    // ── Pointer up ────────────────────────────────────────────────────────────
    this.input.on('pointerup', () => {
      this._dragStart = null;

      if (this._isPainting && this._currentStroke && this._currentStroke.size > 0) {
        // Commit stroke as one undo action
        const layer = this.activeLayer;
        const actions = [];
        for (const [, { tx, ty, oldTile }] of this._currentStroke) {
          const newTile = this.mapData[layer][ty][tx];
          if (oldTile !== newTile) actions.push({ layer, tx, ty, oldTile, newTile });
        }
        if (actions.length > 0) {
          this._undoStack.push(actions);
          this._redoStack = [];
        }
      }

      this._isPainting    = false;
      this._currentStroke = null;
    });

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-E',   () => this._back());
    this.input.keyboard.on('keydown-ESC', () => this._back());

    this.input.keyboard.on('keydown-Z', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.shiftKey ? this._redo() : this._undo();
      }
    });
    this.input.keyboard.on('keydown-Y', (e) => {
      if (e.ctrlKey || e.metaKey) this._redo();
    });

    this.input.keyboard.on('keydown-ONE',   () => this._setLayer('base'));
    this.input.keyboard.on('keydown-TWO',   () => this._setLayer('p1'));
    this.input.keyboard.on('keydown-THREE', () => this._setLayer('p2'));
    this.input.keyboard.on('keydown-FOUR',  () => this._setLayer('merged'));
  }

  // ── Tile painting ─────────────────────────────────────────────────────────────

  _applyTile(ptr, tileType) {
    const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    const tx = Math.floor(wp.x / TILE);
    const ty = Math.floor(wp.y / TILE);
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return;

    const grid = this.mapData[this.activeLayer];

    // Record old tile for undo (only first visit per position in this stroke)
    if (this._currentStroke) {
      const key = ty * WORLD_W + tx;
      if (!this._currentStroke.has(key)) {
        this._currentStroke.set(key, { tx, ty, oldTile: grid[ty][tx] });
      }
    }

    grid[ty][tx] = tileType;
    this.layer.putTileAt(this._compositeAt(tx, ty), tx, ty);
    this._redrawMarkers();
  }

  // Fills over visually-connected tiles (the active layer's composite),
  // writing into the active layer.
  _floodFill(startX, startY, newTile) {
    if (startX < 0 || startY < 0 || startX >= WORLD_W || startY >= WORLD_H) return;
    const layer  = this.activeLayer;
    const grid   = this.mapData[layer];
    const target = this._compositeAt(startX, startY);
    if (target === newTile) return;

    const actions = [];
    const queue   = [[startX, startY]];
    const visited = new Set([startY * WORLD_W + startX]);

    while (queue.length > 0) {
      const [x, y] = queue.shift();
      actions.push({ layer, tx: x, ty: y, oldTile: grid[y][x], newTile });
      grid[y][x] = newTile;
      this.layer.putTileAt(this._compositeAt(x, y), x, y);

      for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
        if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
        const key = ny * WORLD_W + nx;
        if (visited.has(key) || this._compositeAt(nx, ny) !== target) continue;
        visited.add(key);
        queue.push([nx, ny]);
      }
    }

    if (actions.length > 0) {
      this._undoStack.push(actions);
      this._redoStack = [];
    }
    this._redrawMarkers();
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────────

  _undo() {
    const actions = this._undoStack.pop();
    if (!actions) return;
    this._redoStack.push(actions);
    for (const { layer, tx, ty, oldTile } of actions) {
      this.mapData[layer][ty][tx] = oldTile;
    }
    this._refreshTiles();
    this._redrawMarkers();
    this._showToast('Undo');
  }

  _redo() {
    const actions = this._redoStack.pop();
    if (!actions) return;
    this._undoStack.push(actions);
    for (const { layer, tx, ty, newTile } of actions) {
      this.mapData[layer][ty][tx] = newTile;
    }
    this._refreshTiles();
    this._redrawMarkers();
    this._showToast('Redo');
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  _save() {
    this.worldMap.reloadMap(this._cloneLayers(this.mapData));
    this.worldMap.saveMap();
    this._showToast('Map saved!');
  }

  _reset() {
    this.mapData     = this.worldMap._generateDefault();
    this._undoStack  = [];
    this._redoStack  = [];
    this._tilesetKey = 'tiles';

    this._rebuildTilemap();
    this._showToast('Map reset');
  }

  _back() {
    this.worldMap.reloadMap(this._cloneLayers(this.mapData));
    this.worldMap.saveMap();

    this.game.canvas.removeEventListener('wheel', this._preventWheel);

    if (this._uiCam) {
      this.cameras.remove(this._uiCam);
      this._uiCam = null;
    }

    this.layer.destroy();
    this.editorTilemap.destroy();
    this.scene.stop('EditorScene');
    this.scene.resume('GameScene');
    this.scene.resume('UIScene');
  }

  // ── Import helpers ────────────────────────────────────────────────────────────

  _importTileset() {
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = 'image/png,image/jpeg,image/gif';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();

      reader.onload = (ev) => {
        const key = 'custom-tiles';
        if (this.textures.exists(key)) this.textures.remove(key);

        this.textures.once('addtexture-' + key, () => {
          this._tilesetKey = key;
          this._rebuildTilemap();
          this._showToast('Tileset loaded!');
        });

        this.textures.addBase64(key, ev.target.result);
      };

      reader.readAsDataURL(file);
    };

    input.click();
  }

  _importMap(jsonText) {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.json,.tmj';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();

      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          this.mapData = this._parseTiledOrRaw(parsed);
          this._undoStack = [];
          this._redoStack = [];
          this._rebuildTilemap();
          this._showToast('Map imported!');
        } catch (err) {
          this._showToast('Invalid JSON');
        }
      };

      reader.readAsText(file);
    };

    input.click();
  }

  _parseTiledOrRaw(json) {
    // Our own formats: legacy 2D array or v2 {base, p1, p2, merged}
    try {
      return WorldMap.normalizeLayers(json);
    } catch (e) { /* fall through to Tiled */ }

    // Tiled JSON format → becomes the base layer
    if (json.layers) {
      const layer = json.layers.find(l => l.type === 'tilelayer' && l.data);
      if (layer) {
        const w = layer.width  || WORLD_W;
        const h = layer.height || WORLD_H;
        const out = [];
        for (let y = 0; y < h; y++) {
          out[y] = [];
          for (let x = 0; x < w; x++) {
            // Tiled IDs are 1-based; 0 = empty → map to GRASS
            const id = (layer.data[y * w + x] || 1) - 1;
            out[y][x] = Math.min(Math.max(id, 0), TILE_COUNT - 1);
          }
        }
        return WorldMap.normalizeLayers(out);
      }
    }

    throw new Error('Unrecognised map format');
  }

  _rebuildTilemap() {
    this.layer.destroy();
    this.editorTilemap.destroy();
    this._buildTilemap();
    this._buildGrid();
    if (this._uiCam) this._uiCam.ignore([this.layer, this.gridGfx]);
    this._redrawMarkers();
    this.hoverGfx.clear();
  }

  _showToast(msg) {
    const W = this.scale.width;
    const H = this.scale.height;
    const t = this.add.text(W / 2, H - 40, msg, {
      fontSize: '14px', fontFamily: 'monospace', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
      backgroundColor: '#1a1a2e',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5, 1).setDepth(200);

    // Toast is a UI element — exclude from main (world) camera
    if (this._uiCam) this.cameras.main.ignore(t);

    this.tweens.add({
      targets: t, alpha: 0, duration: 1500, delay: 800,
      onComplete: () => t.destroy(),
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  update(_time, delta) {
    const dt  = delta / 1000;
    const cam = this.cameras.main;
    const PAN_SPEED = 400 / cam.zoom;
    const keys = this._panKeys;

    if (keys.left.isDown)  cam.scrollX -= PAN_SPEED * dt;
    if (keys.right.isDown) cam.scrollX += PAN_SPEED * dt;
    if (keys.up.isDown)    cam.scrollY -= PAN_SPEED * dt;
    if (keys.down.isDown)  cam.scrollY += PAN_SPEED * dt;

    const mapW = WORLD_W * TILE;
    const mapH = WORLD_H * TILE;
    const visW = this.scale.width  / cam.zoom;
    const visH = this.scale.height / cam.zoom;
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, Math.max(0, mapW - visW));
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, Math.max(0, mapH - visH));
  }
}
