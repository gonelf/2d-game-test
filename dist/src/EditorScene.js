// EditorScene.js — full-screen tile map editor.
class EditorScene extends Phaser.Scene {
  constructor() {
    super({ key: 'EditorScene' });
  }

  create() {
    const gameScene = this.scene.get('GameScene');
    this.worldMap = gameScene.worldMap;

    this.mapLayers = this._cloneMapLayers(this.worldMap.mapLayers);

    this.selectedTile   = T.GRASS;
    this.activeTool     = 'paint';   // 'paint' | 'fill' | 'erase'
    this.activeLayer    = 0;         // index into MAP_LAYER_NAMES — paint target
    this.activeVis      = VIS.ALL;   // visibility tag applied to painted tiles
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

  // ── Map data helpers ─────────────────────────────────────────────────────────

  _cloneMapLayers(src) {
    return src.map(l => ({
      tiles: l.tiles.map(r => r.slice()),
      vis:   l.vis.map(r => r.slice()),
    }));
  }

  // What the erase tool / right-click writes on the active layer
  _eraseValue() {
    return this.activeLayer === 0 ? T.GRASS : NO_TILE;
  }

  // A tile is shown solid when its tag matches the current visibility context;
  // tiles tagged for other views are ghosted.
  _visMatches(visTag) {
    return visTag === VIS.ALL || visTag === this.activeVis;
  }

  // ── Tilemap ──────────────────────────────────────────────────────────────────

  _buildTilemap() {
    const key = this._tilesetKey || 'tiles';

    this.editorTilemap = this.make.tilemap({
      tileWidth: TILE, tileHeight: TILE, width: WORLD_W, height: WORLD_H,
    });
    const tileset = this.editorTilemap.addTilesetImage('tiles', key, TILE, TILE, 0, 0);

    this.layers = [];
    for (let li = 0; li < MAP_LAYER_COUNT; li++) {
      this.layers.push(this.editorTilemap.createBlankLayer('L' + li, tileset, 0, 0).setDepth(li));
    }
    this._refreshTiles();
  }

  _renderCell(li, tx, ty) {
    const { tiles, vis } = this.mapLayers[li];
    const t = tiles[ty][tx];
    if (t === NO_TILE) {
      this.layers[li].removeTileAt(tx, ty, true);
    } else {
      this.layers[li].putTileAt(t, tx, ty).alpha = this._visMatches(vis[ty][tx]) ? 1 : 0.3;
    }
  }

  _refreshTiles() {
    for (let li = 0; li < MAP_LAYER_COUNT; li++) {
      for (let y = 0; y < WORLD_H; y++) {
        for (let x = 0; x < WORLD_W; x++) {
          this._renderCell(li, x, y);
        }
      }
    }
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

    this.add.text(SB / 2, H - 14, 'WASD pan · Q layer · 1-4 visibility · Ctrl+Z', {
      fontSize: '8px', fontFamily: 'monospace', color: '#8888aa',
      wordWrap: { width: SB - 10 }, align: 'center',
    }).setOrigin(0.5, 1).setDepth(DEPTH + 1);
  }

  _buildPalette(SB, DEPTH) {
    const COLS   = 4;
    const COL_W  = SB / COLS;
    const ROW_H  = 40;
    const START_Y = 38;

    this._paletteButtons = [];

    for (let i = 0; i < TILE_COUNT; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx  = col * COL_W + COL_W / 2;
      const cy  = START_Y + row * ROW_H + ROW_H / 2;

      const sel = this.add.graphics().setDepth(DEPTH + 1);
      sel.lineStyle(2, 0xffffff, 1);
      sel.strokeRect(col * COL_W + 2, START_Y + row * ROW_H + 2, COL_W - 4, ROW_H - 4);
      sel.setVisible(i === this.selectedTile);

      this.add.image(cx, cy, 'tiles', i).setDepth(DEPTH + 2);

      const zone = this.add.zone(col * COL_W, START_Y + row * ROW_H, COL_W, ROW_H)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true });

      const tileIndex = i;
      zone.on('pointerdown', () => {
        this.selectedTile = tileIndex;
        this._updatePaletteHighlight();
      });
      zone.on('pointerover', () => this._paletteCaption.setText(TILE_NAMES[tileIndex]));
      zone.on('pointerout',  () => this._paletteCaption.setText(TILE_NAMES[this.selectedTile]));

      this._paletteButtons.push({ sel });
    }

    const capY = START_Y + Math.ceil(TILE_COUNT / COLS) * ROW_H + 2;
    this._paletteCaption = this.add.text(SB / 2, capY, TILE_NAMES[this.selectedTile], {
      fontSize: '10px', fontFamily: 'monospace', color: '#e0e0ff',
    }).setOrigin(0.5, 0).setDepth(DEPTH + 1);

    // Layout cursor for the sections below
    this._sideY = capY + 16;
  }

  _updatePaletteHighlight() {
    for (let i = 0; i < this._paletteButtons.length; i++) {
      this._paletteButtons[i].sel.setVisible(i === this.selectedTile);
    }
    this._paletteCaption.setText(TILE_NAMES[this.selectedTile]);
  }

  _buildToolButtons(SB, DEPTH) {
    const tools = ['Paint', 'Fill', 'Erase'];
    const keys  = ['paint', 'fill', 'erase'];
    const BTN_W = SB / 3;
    const BTN_H = 24;
    const Y     = this._sideY;
    this._sideY = Y + BTN_H + 6;

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
    const BTN_H = 18;

    const makeRow = (labelText, Y0, defs, onPick) => {
      this.add.text(SB / 2, Y0, labelText, {
        fontSize: '9px', fontFamily: 'monospace', color: '#8888aa',
      }).setOrigin(0.5, 0).setDepth(DEPTH + 1);

      const Y = Y0 + 11;
      const BTN_W = SB / defs.length;
      const btns = [];

      for (let i = 0; i < defs.length; i++) {
        const { label, color } = defs[i];
        const x = i * BTN_W;

        const bg   = this.add.graphics().setDepth(DEPTH + 1);
        const text = this.add.text(x + BTN_W / 2, Y + BTN_H / 2, label, {
          fontSize: '9px', fontFamily: 'monospace', color,
        }).setOrigin(0.5, 0.5).setDepth(DEPTH + 2);

        const idx = i;
        this.add.zone(x, Y, BTN_W, BTN_H)
          .setOrigin(0, 0).setDepth(DEPTH + 3)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => onPick(idx));

        btns.push({ bg, text, x, y: Y, w: BTN_W, h: BTN_H });
      }
      return btns;
    };

    // Paint target layer (stacking order: Ground at the bottom)
    this._layerBtns = makeRow('LAYER', this._sideY,
      MAP_LAYER_NAMES.map(n => ({ label: n.toUpperCase(), color: '#dddddd' })),
      (i) => this._setLayer(i));

    // Visibility tag for painted tiles
    const visColors = ['#dddddd', '#e74c3c', '#3498db', '#9b59b6'];
    this._visBtns = makeRow('VISIBLE TO', this._sideY + 11 + BTN_H + 4,
      VIS_NAMES.map((n, i) => ({ label: n, color: visColors[i] })),
      (v) => this._setVis(v));

    this._sideY += (11 + BTN_H + 4) * 2 + 2;
    this._updateLayerButtons();
  }

  _updateLayerButtons() {
    if (!this._layerBtns) return;
    const paint = (btn, active) => {
      btn.bg.clear();
      btn.bg.fillStyle(active ? 0x4a4a8a : 0x2a2a4a, 1);
      btn.bg.fillRect(btn.x + 2, btn.y, btn.w - 4, btn.h);
      btn.text.setAlpha(active ? 1 : 0.6);
    };
    this._layerBtns.forEach((b, i) => paint(b, i === this.activeLayer));
    this._visBtns.forEach((b, v) => paint(b, v === this.activeVis));
  }

  _buildImportButtons(SB, DEPTH) {
    // Single compact row below the layer/visibility selectors
    const Y = this._sideY;
    const BTN_H = 20;
    const imports = [
      { label: 'Tiles PNG', action: () => this._importTileset() },
      { label: 'Map JSON',  action: () => this._importMap()     },
    ];
    const W2 = (SB - 12) / 2;

    for (let i = 0; i < imports.length; i++) {
      const x = 4 + i * (W2 + 4);

      const btnBg = this.add.graphics().setDepth(DEPTH + 1);
      btnBg.fillStyle(0x2a3a2a, 1);
      btnBg.fillRect(x, Y, W2, BTN_H);

      this.add.text(x + W2 / 2, Y + BTN_H / 2, imports[i].label, {
        fontSize: '9px', fontFamily: 'monospace', color: '#88cc88',
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 2);

      this.add.zone(x, Y, W2, BTN_H)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', imports[i].action);
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
    // Outline tagged (non-ALL) tiles on the active layer in their tag colour
    const { tiles, vis } = this.mapLayers[this.activeLayer];
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        if (tiles[y][x] === NO_TILE || vis[y][x] === VIS.ALL) continue;
        g.lineStyle(2, VIS_COLORS[vis[y][x]], 0.9);
        g.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
      }
    }
  }

  // ── Layer / visibility switching ─────────────────────────────────────────────

  _setLayer(idx) {
    if (this.activeLayer === idx || this._isPainting) return;
    this.activeLayer = idx;
    this._redrawMarkers();
    this._updateLayerButtons();
  }

  _setVis(v) {
    if (this.activeVis === v || this._isPainting) return;
    this.activeVis = v;
    this._refreshTiles(); // re-ghost tiles for the new visibility context
    this._redrawMarkers();
    this._updateLayerButtons();
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
    this._uiCam.ignore([...this.layers, this.gridGfx, this.markerGfx, this.hoverGfx]);
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
        this._hudText.setText(`${tx},${ty}  ${this.cameras.main.zoom.toFixed(2)}x  [${MAP_LAYER_NAMES[this.activeLayer].toUpperCase()}·${VIS_NAMES[this.activeVis]}]`);
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
        const li = this.activeLayer;
        const { tiles, vis } = this.mapLayers[li];
        const actions = [];
        for (const [, { tx, ty, oldT, oldV }] of this._currentStroke) {
          const newT = tiles[ty][tx];
          const newV = vis[ty][tx];
          if (oldT !== newT || oldV !== newV) actions.push({ li, tx, ty, oldT, oldV, newT, newV });
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

    this.input.keyboard.on('keydown-ONE',   () => this._setVis(VIS.ALL));
    this.input.keyboard.on('keydown-TWO',   () => this._setVis(VIS.P1));
    this.input.keyboard.on('keydown-THREE', () => this._setVis(VIS.P2));
    this.input.keyboard.on('keydown-FOUR',  () => this._setVis(VIS.MERGED));
    this.input.keyboard.on('keydown-Q',
      () => this._setLayer((this.activeLayer + 1) % MAP_LAYER_COUNT));
  }

  // ── Tile painting ─────────────────────────────────────────────────────────────

  _applyTile(ptr, tileType) {
    const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    const tx = Math.floor(wp.x / TILE);
    const ty = Math.floor(wp.y / TILE);
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return;

    const { tiles, vis } = this.mapLayers[this.activeLayer];

    // Record old cell for undo (only first visit per position in this stroke)
    if (this._currentStroke) {
      const key = ty * WORLD_W + tx;
      if (!this._currentStroke.has(key)) {
        this._currentStroke.set(key, { tx, ty, oldT: tiles[ty][tx], oldV: vis[ty][tx] });
      }
    }

    tiles[ty][tx] = tileType;
    vis[ty][tx]   = tileType === NO_TILE ? VIS.ALL : this.activeVis;
    this._renderCell(this.activeLayer, tx, ty);
    this._redrawMarkers();
  }

  // Fills the connected region of identical (tile, visibility) cells on the
  // active layer, writing the selected tile with the active visibility tag.
  _floodFill(startX, startY, newTile) {
    if (startX < 0 || startY < 0 || startX >= WORLD_W || startY >= WORLD_H) return;
    const li = this.activeLayer;
    const { tiles, vis } = this.mapLayers[li];
    const targetT = tiles[startY][startX];
    const targetV = vis[startY][startX];
    const newV    = this.activeVis;
    if (targetT === newTile && targetV === newV) return;

    const actions = [];
    const queue   = [[startX, startY]];
    const visited = new Set([startY * WORLD_W + startX]);

    while (queue.length > 0) {
      const [x, y] = queue.shift();
      actions.push({ li, tx: x, ty: y, oldT: tiles[y][x], oldV: vis[y][x], newT: newTile, newV });
      tiles[y][x] = newTile;
      vis[y][x]   = newV;
      this._renderCell(li, x, y);

      for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
        if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
        const key = ny * WORLD_W + nx;
        if (visited.has(key) || tiles[ny][nx] !== targetT || vis[ny][nx] !== targetV) continue;
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
    for (const { li, tx, ty, oldT, oldV } of actions) {
      this.mapLayers[li].tiles[ty][tx] = oldT;
      this.mapLayers[li].vis[ty][tx]   = oldV;
      this._renderCell(li, tx, ty);
    }
    this._redrawMarkers();
    this._showToast('Undo');
  }

  _redo() {
    const actions = this._redoStack.pop();
    if (!actions) return;
    this._undoStack.push(actions);
    for (const { li, tx, ty, newT, newV } of actions) {
      this.mapLayers[li].tiles[ty][tx] = newT;
      this.mapLayers[li].vis[ty][tx]   = newV;
      this._renderCell(li, tx, ty);
    }
    this._redrawMarkers();
    this._showToast('Redo');
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  _save() {
    this.worldMap.reloadMap(this._cloneMapLayers(this.mapLayers));
    this.worldMap.saveMap();
    this._showToast('Map saved!');
  }

  _reset() {
    this.mapLayers   = this.worldMap._generateDefault();
    this._undoStack  = [];
    this._redoStack  = [];
    this._tilesetKey = 'tiles';

    this._rebuildTilemap();
    this._showToast('Map reset');
  }

  _back() {
    this.worldMap.reloadMap(this._cloneMapLayers(this.mapLayers));
    this.worldMap.saveMap();

    this.game.canvas.removeEventListener('wheel', this._preventWheel);

    if (this._uiCam) {
      this.cameras.remove(this._uiCam);
      this._uiCam = null;
    }

    this.layers.forEach(l => l.destroy());
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
          this.mapLayers = this._parseTiledOrRaw(parsed);
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
    // Our own formats: v3 layer stack, v2 override grids or legacy 2D array
    try {
      return WorldMap.normalize(json);
    } catch (e) { /* fall through to Tiled */ }

    // Tiled JSON format → becomes the Ground layer
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
        return WorldMap.fromBase(out);
      }
    }

    throw new Error('Unrecognised map format');
  }

  _rebuildTilemap() {
    this.layers.forEach(l => l.destroy());
    this.editorTilemap.destroy();
    this._buildTilemap();
    this._buildGrid();
    if (this._uiCam) this._uiCam.ignore([...this.layers, this.gridGfx]);
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
