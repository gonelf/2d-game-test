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
    this.activeTool     = 'paint';   // 'paint' | 'fill' | 'erase' | 'select'
    this._selectedCell  = null;      // {tx, ty} inspected by the select tool
    this._dimOthers     = false;     // dim layers other than the active one
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
    this._buildSelectRect();

    // Snapshot children before building UI so we can isolate UI objects
    const preUI = new Set(this.children.list);
    this._buildSidebar();
    this._buildHUD();
    this._buildInspector();
    this._buildTilePicker();
    this._buildMinimap();
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
      let alpha = this._visMatches(vis[ty][tx]) ? 1 : 0.3;
      if (this._dimOthers && li !== this.activeLayer) alpha = Math.min(alpha, 0.25);
      this.layers[li].putTileAt(t, tx, ty).alpha = alpha;
    }
    this._paintMinimapCell(tx, ty);
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

  // Light up a button's footprint while the pointer is over its zone
  _hover(zone, x, y, w, h) {
    zone.on('pointerover', () => {
      this._uiHoverGfx.clear();
      this._uiHoverGfx.fillStyle(0xffffff, 0.12);
      this._uiHoverGfx.fillRect(x, y, w, h);
    });
    zone.on('pointerout', () => this._uiHoverGfx.clear());
  }

  _buildSidebar() {
    const H = this.scale.height;
    const SB = this.SIDEBAR_W;
    const DEPTH = 50;

    // Shared hover-highlight overlay for all UI buttons
    this._uiHoverGfx = this.add.graphics().setDepth(99);

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

    this.add.text(SB / 2, H - 14,
      'B/F/X/V tools · Alt+click pick · H dim · G grid · Q layer · 1-4 vis · +/- zoom · 0 fit · WASD pan · Ctrl+Z', {
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
        this._updateInspector();
      });
      zone.on('pointerover', () => this._paletteCaption.setText(this._tileLabel(tileIndex)));
      zone.on('pointerout',  () => this._paletteCaption.setText(this._tileLabel(this.selectedTile)));
      this._hover(zone, col * COL_W + 2, START_Y + row * ROW_H + 2, COL_W - 4, ROW_H - 4);

      this._paletteButtons.push({ sel });
    }

    const capY = START_Y + Math.ceil(TILE_COUNT / COLS) * ROW_H + 2;
    this._paletteCaption = this.add.text(SB / 2, capY, this._tileLabel(this.selectedTile), {
      fontSize: '10px', fontFamily: 'monospace', color: '#e0e0ff',
    }).setOrigin(0.5, 0).setDepth(DEPTH + 1);

    // Layout cursor for the sections below
    this._sideY = capY + 16;
  }

  _tileLabel(i) {
    return `${TILE_NAMES[i]} · ${WALK_NAMES[TILE_WALK[i]]}`;
  }

  _updatePaletteHighlight() {
    for (let i = 0; i < this._paletteButtons.length; i++) {
      this._paletteButtons[i].sel.setVisible(i === this.selectedTile);
    }
    this._paletteCaption.setText(this._tileLabel(this.selectedTile));
    this._refreshHover(); // ghost preview tracks the new selection
  }

  _buildToolButtons(SB, DEPTH) {
    const tools = ['Paint', 'Fill', 'Erase', 'Select'];
    const keys  = ['paint', 'fill', 'erase', 'select'];
    const BTN_W = SB / tools.length;
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
      this._hover(zone, x + 2, Y, BTN_W - 4, BTN_H);

      const toolKey = keys[i];
      zone.on('pointerdown', () => this._setTool(toolKey));

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
        const zone = this.add.zone(x, Y, BTN_W, BTN_H)
          .setOrigin(0, 0).setDepth(DEPTH + 3)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => onPick(idx));
        this._hover(zone, x + 2, Y, BTN_W - 4, BTN_H);

        btns.push({ bg, text, x, y: Y, w: BTN_W, h: BTN_H });
      }
      return btns;
    };

    // Dim-other-layers toggle, in the LAYER label row
    this._dimBtn = this.add.text(SB - 6, this._sideY, '[dim]', {
      fontSize: '9px', fontFamily: 'monospace', color: '#8888aa',
    }).setOrigin(1, 0).setDepth(DEPTH + 3)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._toggleDim());

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
      { label: 'Tiles',  action: () => this._importTileset() },
      { label: 'Import', action: () => this._importMap()     },
      { label: 'Export', action: () => this._exportMap()     },
    ];
    const W2 = (SB - 16) / 3;

    for (let i = 0; i < imports.length; i++) {
      const x = 4 + i * (W2 + 4);

      const btnBg = this.add.graphics().setDepth(DEPTH + 1);
      btnBg.fillStyle(0x2a3a2a, 1);
      btnBg.fillRect(x, Y, W2, BTN_H);

      this.add.text(x + W2 / 2, Y + BTN_H / 2, imports[i].label, {
        fontSize: '9px', fontFamily: 'monospace', color: '#88cc88',
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 2);

      const zone = this.add.zone(x, Y, W2, BTN_H)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', imports[i].action);
      this._hover(zone, x, Y, W2, BTN_H);
    }
  }

  _buildActionButtons(SB, DEPTH) {
    const H = this.scale.height;
    const actions = [
      { label: 'Save',  color: 0x1a7a3a, textColor: '#aaffaa', action: () => this._save()  },
      { label: 'Reset', color: 0x7a4a1a, textColor: '#ffccaa', action: (t) => this._confirmReset(t) },
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

      const label = this.add.text(SB / 2, startY + BTN_H / 2, act.label, {
        fontSize: '12px', fontFamily: 'monospace', color: act.textColor,
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 2);

      const zone = this.add.zone(8, startY, SB - 16, BTN_H)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => act.action(label));
      this._hover(zone, 8, label.y - BTN_H / 2, SB - 16, BTN_H);

      startY += BTN_H + GAP;
    }
  }

  // Reset is destructive — require a second click within a short window
  _confirmReset(label) {
    if (this._resetArmed) {
      this._resetArmed = false;
      this._resetTimer?.remove();
      label.setText('Reset');
      this._reset();
      return;
    }
    this._resetArmed = true;
    label.setText('Sure?');
    this._showToast('Click again to reset the map');
    this._resetTimer = this.time.delayedCall(2500, () => {
      this._resetArmed = false;
      label.setText('Reset');
    });
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
    if (this._dimOthers) this._refreshTiles();
    this._redrawMarkers();
    this._updateLayerButtons();
  }

  _toggleDim() {
    this._dimOthers = !this._dimOthers;
    this._dimBtn.setColor(this._dimOthers ? '#aaffaa' : '#8888aa');
    this._refreshTiles();
    this._showToast(this._dimOthers
      ? `Dimming layers other than ${MAP_LAYER_NAMES[this.activeLayer]}`
      : 'All layers at full brightness');
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
    // Ghost preview of the tile about to be painted
    this.ghostTile = this.add.image(0, 0, 'tiles', 0)
      .setAlpha(0.55).setDepth(5).setVisible(false);
    this._hoverCell = null;
  }

  _updateHoverRect(tx, ty) {
    const g = this.hoverGfx;
    g.clear();
    this.ghostTile.setVisible(false);
    this._hoverCell = null;
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return;
    this._hoverCell = { tx, ty };

    const TOOL_COLORS = { paint: 0xffffff, fill: 0xffffff, erase: 0xff6655, select: 0xffe66d };
    const color = TOOL_COLORS[this.activeTool] ?? 0xffffff;
    g.lineStyle(2, color, 0.9);
    g.strokeRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);

    if ((this.activeTool === 'paint' || this.activeTool === 'fill') && !this._isPainting) {
      this.ghostTile.setFrame(this.selectedTile)
        .setPosition(tx * TILE + TILE / 2, ty * TILE + TILE / 2)
        .setVisible(true);
    } else {
      g.fillStyle(color, 0.15);
      g.fillRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
    }
  }

  // Re-style the hover cell in place (tool or palette changed under the cursor)
  _refreshHover() {
    if (this._hoverCell) this._updateHoverRect(this._hoverCell.tx, this._hoverCell.ty);
  }

  // ── Select tool / inspector ──────────────────────────────────────────────────

  _buildSelectRect() {
    this.selectGfx = this.add.graphics().setDepth(6).setScrollFactor(1);
  }

  _drawSelectRect() {
    const g = this.selectGfx;
    g.clear();
    if (!this._selectedCell) return;
    const { tx, ty } = this._selectedCell;
    g.lineStyle(2, 0xffe66d, 1);
    g.strokeRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
  }

  _selectCell(tx, ty) {
    this._selectedCell = (tx >= 0 && ty >= 0 && tx < WORLD_W && ty < WORLD_H)
      ? { tx, ty } : null;
    this._drawSelectRect();
    this._updateInspector();
  }

  _clearSelection() {
    this._selectedCell = null;
    this._drawSelectRect();
    this._updateInspector();
  }

  // Writes one cell on one layer as a single undoable action (inspector edits)
  _setCell(li, tx, ty, newT, newV) {
    const { tiles, vis } = this.mapLayers[li];
    const oldT = tiles[ty][tx];
    const oldV = vis[ty][tx];
    if (oldT === newT && oldV === newV) return;
    tiles[ty][tx] = newT;
    vis[ty][tx]   = newV;
    this._undoStack.push([{ li, tx, ty, oldT, oldV, newT, newV }]);
    this._redoStack = [];
    this._renderCell(li, tx, ty);
    this._redrawMarkers();
    this._updateInspector();
  }

  _buildInspector() {
    const W        = this.scale.width;
    const PANEL_W  = 300;
    const ROW_H    = 30;
    const HEADER_H = 34;
    const PANEL_H  = HEADER_H + MAP_LAYER_COUNT * ROW_H + 8;
    const X        = W - PANEL_W - 8;
    const Y        = 8;
    const DEPTH    = 70;

    this._inspRect = { x: X, y: Y, w: PANEL_W, h: PANEL_H };
    this._inspObjs = [];
    const track = (o) => { this._inspObjs.push(o); return o; };

    const bg = track(this.add.graphics().setDepth(DEPTH));
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRect(X, Y, PANEL_W, PANEL_H);
    bg.lineStyle(1, 0x3a3a5e, 1);
    bg.strokeRect(X, Y, PANEL_W, PANEL_H);

    this._inspTitle = track(this.add.text(X + 8, Y + 6, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#e0e0ff',
    }).setDepth(DEPTH + 1));

    // Per-view walkability of the whole cell (top-down layer scan)
    this._inspWalk = track(this.add.text(X + 8, Y + 19, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#8888aa',
    }).setDepth(DEPTH + 1));

    const makeBtn = (x, y, w, h, label, fill, textColor, onClick) => {
      const g = track(this.add.graphics().setDepth(DEPTH + 1));
      g.fillStyle(fill, 1);
      g.fillRect(x, y, w, h);
      track(this.add.text(x + w / 2, y + h / 2, label, {
        fontSize: '9px', fontFamily: 'monospace', color: textColor,
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 2));
      const zone = track(this.add.zone(x, y, w, h)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onClick));
      this._hover(zone, x, y, w, h);
    };

    this._inspRows = [];
    // Display layers top-down (Top first) to mirror the visual stack
    for (let i = 0; i < MAP_LAYER_COUNT; i++) {
      const li   = MAP_LAYER_COUNT - 1 - i;
      const rowY = Y + HEADER_H + i * ROW_H;
      const cy   = rowY + ROW_H / 2;

      const name = track(this.add.text(X + 8, cy, MAP_LAYER_NAMES[li].toUpperCase(), {
        fontSize: '9px', fontFamily: 'monospace', color: '#8888aa',
      }).setOrigin(0, 0.5).setDepth(DEPTH + 1));

      const thumb = track(this.add.image(X + 60, cy, 'tiles', 0)
        .setScale(0.6).setDepth(DEPTH + 1));

      const tileName = track(this.add.text(X + 76, cy, '', {
        fontSize: '9px', fontFamily: 'monospace', color: '#e0e0ff',
      }).setOrigin(0, 0.5).setDepth(DEPTH + 1));

      track(this.add.text(X + 164, cy, '▾', {
        fontSize: '9px', fontFamily: 'monospace', color: '#666688',
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 1));

      // The row itself opens an in-panel tile picker for this layer — no trip
      // back to the palette needed
      const rowZone = track(this.add.zone(X + 4, rowY + 2, 166, ROW_H - 4)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (!this._selectedCell) return;
          if (this._pickerVisible && this._pickerLi === li) {
            this._closePicker();
          } else {
            this._openPicker(li);
          }
        }));
      this._hover(rowZone, X + 4, rowY + 2, 166, ROW_H - 4);

      // Visibility tag — click to cycle ALL/P1/P2/MRG on a placed tile
      const visTag = track(this.add.text(X + 186, cy, '', {
        fontSize: '9px', fontFamily: 'monospace', color: '#ffffff',
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 1));
      track(this.add.zone(X + 172, rowY + 4, 28, ROW_H - 8)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (!this._selectedCell) return;
          const { tx, ty } = this._selectedCell;
          const { tiles, vis } = this.mapLayers[li];
          if (tiles[ty][tx] === NO_TILE) return;
          this._setCell(li, tx, ty, tiles[ty][tx], (vis[ty][tx] + 1) % VIS_NAMES.length);
        }));

      // Set: place the palette tile (with the active visibility) on this layer
      makeBtn(X + 208, rowY + 6, 40, ROW_H - 12, 'Set', 0x2a3a2a, '#88cc88', () => {
        if (!this._selectedCell) return;
        const { tx, ty } = this._selectedCell;
        this._setCell(li, tx, ty, this.selectedTile, this.activeVis);
      });

      // X: clear this layer at the cell (grass on Ground, empty above)
      makeBtn(X + 254, rowY + 6, 18, ROW_H - 12, 'X', 0x3a2a2a, '#cc8888', () => {
        if (!this._selectedCell) return;
        const { tx, ty } = this._selectedCell;
        this._setCell(li, tx, ty, li === 0 ? T.GRASS : NO_TILE, VIS.ALL);
      });

      this._inspRows.push({ li, name, thumb, tileName, visTag });
    }

    this._setInspectorVisible(false);
  }

  _setInspectorVisible(visible) {
    this._inspVisible = visible;
    for (const o of this._inspObjs) o.setVisible(visible);
    // Hidden zones still receive input unless disabled
    for (const o of this._inspObjs) {
      if (o.input) o.input.enabled = visible;
    }
  }

  _pointInInspector(px, py) {
    const r = this._inspRect;
    return this._inspVisible &&
      px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // ── Tile picker (dropdown under the inspector) ───────────────────────────────

  _buildTilePicker() {
    const DEPTH = 80;
    const COLS  = 6;
    const CELL  = 26;
    const items = TILE_COUNT + 1; // all tiles + a "clear" cell
    const ROWS  = Math.ceil(items / COLS);
    const W = COLS * CELL + 8;
    const H = ROWS * CELL + 22;
    const X = this._inspRect.x;
    const Y = this._inspRect.y + this._inspRect.h + 4;
    this._pickerRect = { x: X, y: Y, w: W, h: H, cols: COLS, cell: CELL };
    this._pickerLi   = null;
    this._pickerObjs = [];
    const track = (o) => { this._pickerObjs.push(o); return o; };

    const bg = track(this.add.graphics().setDepth(DEPTH));
    bg.fillStyle(0x1a1a2e, 0.97);
    bg.fillRect(X, Y, W, H);
    bg.lineStyle(1, 0x3a3a5e, 1);
    bg.strokeRect(X, Y, W, H);

    this._pickerTitle = track(this.add.text(X + 6, Y + 5, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#8888aa',
    }).setDepth(DEPTH + 1));

    this._pickerSel = track(this.add.graphics().setDepth(DEPTH + 1));

    for (let i = 0; i < items; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx0 = X + 4 + col * CELL;
      const cy0 = Y + 18 + row * CELL;

      if (i < TILE_COUNT) {
        track(this.add.image(cx0 + CELL / 2, cy0 + CELL / 2, 'tiles', i)
          .setScale(0.7).setDepth(DEPTH + 2));
      } else {
        track(this.add.text(cx0 + CELL / 2, cy0 + CELL / 2, '∅', {
          fontSize: '12px', fontFamily: 'monospace', color: '#cc8888',
        }).setOrigin(0.5, 0.5).setDepth(DEPTH + 2));
      }

      const idx  = i;
      const zone = track(this.add.zone(cx0, cy0, CELL, CELL)
        .setOrigin(0, 0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this._pickTile(idx < TILE_COUNT ? idx : null)));
      this._hover(zone, cx0, cy0, CELL, CELL);
    }

    this._setPickerVisible(false);
  }

  _setPickerVisible(visible) {
    this._pickerVisible = visible;
    for (const o of this._pickerObjs) {
      o.setVisible(visible);
      if (o.input) o.input.enabled = visible;
    }
  }

  _openPicker(li) {
    this._pickerLi = li;
    this._pickerTitle.setText(`${MAP_LAYER_NAMES[li].toUpperCase()} — click a tile, ∅ clears`);
    this._setPickerVisible(true);
    this._updatePickerHighlight();
  }

  _closePicker() {
    this._pickerLi = null;
    this._setPickerVisible(false);
  }

  _updatePickerHighlight() {
    if (!this._pickerVisible) return;
    const g = this._pickerSel;
    g.clear();
    if (this._pickerLi == null || !this._selectedCell) return;
    const { tx, ty } = this._selectedCell;
    const t   = this.mapLayers[this._pickerLi].tiles[ty][tx];
    const idx = t === NO_TILE ? TILE_COUNT : t;
    const r   = this._pickerRect;
    const col = idx % r.cols;
    const row = Math.floor(idx / r.cols);
    g.lineStyle(2, 0xffe66d, 1);
    g.strokeRect(r.x + 4 + col * r.cell + 1, r.y + 18 + row * r.cell + 1, r.cell - 2, r.cell - 2);
  }

  // Apply a picker choice to the selected cell; null clears the layer.
  // The picker stays open so tiles can be tried in quick succession.
  _pickTile(t) {
    if (this._pickerLi == null || !this._selectedCell) return;
    const { tx, ty } = this._selectedCell;
    const li = this._pickerLi;
    if (t === null) {
      this._setCell(li, tx, ty, li === 0 ? T.GRASS : NO_TILE, VIS.ALL);
    } else {
      // Keep the tile's existing visibility tag; fall back to the active one
      const hadTile = this.mapLayers[li].tiles[ty][tx] !== NO_TILE;
      const v = hadTile ? this.mapLayers[li].vis[ty][tx] : this.activeVis;
      this._setCell(li, tx, ty, t, v);
    }
  }

  _pointInPicker(px, py) {
    const r = this._pickerRect;
    return this._pickerVisible &&
      px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // Mirrors WorldMap.isTileWalkable against the editor's (unsaved) map data
  _walkableIn(view, tx, ty) {
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

  _updateInspector() {
    if (!this._selectedCell) {
      this._setInspectorVisible(false);
      if (this._pickerObjs) this._closePicker();
      return;
    }
    const { tx, ty } = this._selectedCell;
    this._inspTitle.setText(`TILE ${tx},${ty} — Set places ${TILE_NAMES[this.selectedTile]}`);

    const mark = (view) => this._walkableIn(view, tx, ty) ? '✓' : '✗';
    this._inspWalk.setText(`walk  P1 ${mark('p1')} · P2 ${mark('p2')} · MRG ${mark('merged')}`);

    for (const row of this._inspRows) {
      const { tiles, vis } = this.mapLayers[row.li];
      const t = tiles[ty][tx];
      if (t === NO_TILE) {
        row.thumb.setVisible(false);
        row.tileName.setText('(empty)').setColor('#666688');
        row.visTag.setText('');
      } else {
        row.thumb.setFrame(t);
        row.tileName.setText(`${TILE_NAMES[t]} ·${WALK_NAMES[TILE_WALK[t]]}`).setColor('#e0e0ff');
        const v = vis[ty][tx];
        row.visTag.setText(VIS_NAMES[v])
          .setColor('#' + VIS_COLORS[v].toString(16).padStart(6, '0'));
      }
    }

    this._setInspectorVisible(true);
    // setVisible(true) above re-shows every tracked object; re-hide empty thumbs
    for (const row of this._inspRows) {
      if (this.mapLayers[row.li].tiles[ty][tx] === NO_TILE) row.thumb.setVisible(false);
    }
    if (this._pickerObjs) this._updatePickerHighlight();
  }

  // ── Minimap ───────────────────────────────────────────────────────────────────

  _buildMinimap() {
    const W = this.scale.width;
    const H = this.scale.height;
    const PX = 2; // minimap pixels per tile
    const MMW = WORLD_W * PX;
    const MMH = WORLD_H * PX;
    const X = W - MMW - 8;
    const Y = H - MMH - 30;
    const DEPTH = 60;
    this._mmRect = { x: X, y: Y, w: MMW, h: MMH, px: PX };

    if (this.textures.exists('editor-minimap')) this.textures.remove('editor-minimap');
    this._mmTex = this.textures.createCanvas('editor-minimap', MMW, MMH);
    this._mmCtx = this._mmTex.context;

    const frame = this.add.graphics().setDepth(DEPTH);
    frame.fillStyle(0x1a1a2e, 0.9);
    frame.fillRect(X - 2, Y - 2, MMW + 4, MMH + 4);
    frame.lineStyle(1, 0x3a3a5e, 1);
    frame.strokeRect(X - 2, Y - 2, MMW + 4, MMH + 4);

    this.add.image(X, Y, 'editor-minimap').setOrigin(0, 0).setDepth(DEPTH + 1);
    this._mmViewGfx = this.add.graphics().setDepth(DEPTH + 2);

    this._redrawMinimap();
  }

  _paintMinimapCell(tx, ty) {
    if (!this._mmCtx) return;
    const top = this._topTileAt(tx, ty);
    const color = top ? TILE_DEFS[top.t].color : 0x111122;
    const px = this._mmRect.px;
    this._mmCtx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    this._mmCtx.fillRect(tx * px, ty * px, px, px);
    this._mmDirty = true;
  }

  _redrawMinimap() {
    if (!this._mmCtx) return;
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        this._paintMinimapCell(x, y);
      }
    }
  }

  _pointInMinimap(px, py) {
    const r = this._mmRect;
    return r && px >= r.x - 2 && px <= r.x + r.w + 2 && py >= r.y - 2 && py <= r.y + r.h + 2;
  }

  // Center the camera on the world point under a minimap click
  _mmJump(ptr) {
    const r = this._mmRect;
    this.cameras.main.centerOn(
      (ptr.x - r.x) / r.px * TILE,
      (ptr.y - r.y) / r.px * TILE);
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
    this._uiCam.ignore([...this.layers, this.gridGfx, this.markerGfx, this.hoverGfx, this.selectGfx, this.ghostTile]);
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

      // Sidebar, inspector, and picker clicks are handled by their own zones
      if (ptr.x <= this.SIDEBAR_W) return;
      if (this._pointInInspector(ptr.x, ptr.y)) return;
      if (this._pointInPicker(ptr.x, ptr.y)) return;

      // Minimap: jump the camera; keep panning while the pointer is held
      if (this._pointInMinimap(ptr.x, ptr.y)) {
        this._mmDrag = true;
        this._mmJump(ptr);
        return;
      }

      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const tx = Math.floor(wp.x / TILE);
      const ty = Math.floor(wp.y / TILE);

      // Alt+click: eyedropper — pick the topmost tile into the palette
      if (ptr.event?.altKey) {
        this._eyedrop(tx, ty);
        return;
      }

      // Select tool: pick a cell to inspect (any mouse button)
      if (this.activeTool === 'select') {
        this._selectCell(tx, ty);
        return;
      }

      if (this.activeTool === 'fill' && !ptr.rightButtonDown()) {
        this._floodFill(tx, ty, this.selectedTile);
        return;
      }

      // Paint stroke. Right-click always erases (to grass on base, clears the
      // override on view layers), regardless of the active tool.
      const erasing = ptr.rightButtonDown() || this.activeTool === 'erase';
      this._isPainting    = true;
      this._currentStroke = new Map();
      this._strokeValue   = erasing ? this._eraseValue() : this.selectedTile;
      this._applyTile(ptr, this._strokeValue);
    });

    // ── Pointer move ──────────────────────────────────────────────────────────
    this.input.on('pointermove', (ptr) => {
      // Middle-mouse drag pan
      if (this._dragStart && ptr.middleButtonDown()) {
        const cam = this.cameras.main;
        cam.scrollX = this._dragStart.sx - (ptr.x - this._dragStart.px) / cam.zoom;
        cam.scrollY = this._dragStart.sy - (ptr.y - this._dragStart.py) / cam.zoom;
      }

      // Minimap drag pan
      if (this._mmDrag && ptr.isDown) {
        this._mmJump(ptr);
        return;
      }

      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const tx = Math.floor(wp.x / TILE);
      const ty = Math.floor(wp.y / TILE);

      const overUI = ptr.x <= this.SIDEBAR_W ||
        this._pointInInspector(ptr.x, ptr.y) || this._pointInPicker(ptr.x, ptr.y) ||
        this._pointInMinimap(ptr.x, ptr.y);
      if (!overUI) {
        this._updateHoverRect(tx, ty);
        const top = this._topTileAt(tx, ty);
        const under = top ? `  ${TILE_NAMES[top.t]}(${MAP_LAYER_NAMES[top.li]})` : '';
        this._hudText.setText(`${tx},${ty}${under}  ${this.cameras.main.zoom.toFixed(2)}x  [${MAP_LAYER_NAMES[this.activeLayer].toUpperCase()}·${VIS_NAMES[this.activeVis]}]`);
      } else {
        this._updateHoverRect(-1, -1);
        this._hudText.setText('');
      }

      if (this._isPainting && ptr.isDown && !overUI) {
        this._applyTile(ptr, this._strokeValue);
      }
    });

    // ── Pointer up ────────────────────────────────────────────────────────────
    this.input.on('pointerup', () => {
      this._dragStart = null;
      this._mmDrag    = false;

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
    this.input.keyboard.on('keydown-E', () => this._back());
    // Esc backs out one step: picker, then selection, then the editor itself
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._pickerVisible) {
        this._closePicker();
      } else if (this._selectedCell) {
        this._clearSelection();
      } else {
        this._back();
      }
    });

    // Arrow keys walk the selection from square to square
    const moveSel = (dx, dy) => {
      if (!this._selectedCell) return;
      this._selectCell(
        Phaser.Math.Clamp(this._selectedCell.tx + dx, 0, WORLD_W - 1),
        Phaser.Math.Clamp(this._selectedCell.ty + dy, 0, WORLD_H - 1));
    };
    this.input.keyboard.on('keydown-UP',    () => moveSel(0, -1));
    this.input.keyboard.on('keydown-DOWN',  () => moveSel(0, 1));
    this.input.keyboard.on('keydown-LEFT',  () => moveSel(-1, 0));
    this.input.keyboard.on('keydown-RIGHT', () => moveSel(1, 0));

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

    this.input.keyboard.on('keydown-B', () => this._setTool('paint'));
    this.input.keyboard.on('keydown-F', () => this._setTool('fill'));
    this.input.keyboard.on('keydown-X', () => this._setTool('erase'));
    this.input.keyboard.on('keydown-V', () => this._setTool('select'));
    this.input.keyboard.on('keydown-G', () => this.gridGfx.setVisible(!this.gridGfx.visible));
    this.input.keyboard.on('keydown-H', () => this._toggleDim());

    // Keyboard zoom; 0 fits the whole map on screen
    const zoomBy = (f) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, 0.25, 4));
    };
    this.input.keyboard.on('keydown-PLUS',            () => zoomBy(1.25));
    this.input.keyboard.on('keydown-NUMPAD_ADD',      () => zoomBy(1.25));
    this.input.keyboard.on('keydown-MINUS',           () => zoomBy(0.8));
    this.input.keyboard.on('keydown-NUMPAD_SUBTRACT', () => zoomBy(0.8));
    this.input.keyboard.on('keydown-ZERO', () => {
      const cam  = this.cameras.main;
      const mapW = WORLD_W * TILE;
      const mapH = WORLD_H * TILE;
      cam.setZoom(Math.max(0.25,
        Math.min((this.scale.width - this.SIDEBAR_W) / mapW, this.scale.height / mapH)));
      cam.centerOn(mapW / 2, mapH / 2);
    });
  }

  _setTool(toolKey) {
    if (this.activeTool === toolKey || this._isPainting) return;
    this.activeTool = toolKey;
    this._updateToolButtons();
    if (toolKey !== 'select') this._clearSelection();
    this._refreshHover();
  }

  // Eyedropper: adopt the topmost tile at the cell as the palette selection,
  // along with its layer and visibility tag.
  _eyedrop(tx, ty) {
    const top = this._topTileAt(tx, ty);
    if (!top) return;
    this.selectedTile = top.t;
    this._updatePaletteHighlight();
    this._setLayer(top.li);
    this._setVis(this.mapLayers[top.li].vis[ty][tx]);
    this._updateInspector();
    this._showToast(`Picked ${TILE_NAMES[top.t]} (${MAP_LAYER_NAMES[top.li]})`);
  }

  // Topmost non-empty layer at a cell, or null
  _topTileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return null;
    for (let li = MAP_LAYER_COUNT - 1; li >= 0; li--) {
      const t = this.mapLayers[li].tiles[ty][tx];
      if (t !== NO_TILE) return { li, t };
    }
    return null;
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
    this._updateInspector();
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
    this._updateInspector();
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

  _exportMap() {
    const blob = new Blob(
      [JSON.stringify({ version: 3, layers: this.mapLayers })],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'splitworld-map.json';
    a.click();
    URL.revokeObjectURL(a.href);
    this._showToast('Map exported');
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
    this._updateInspector();
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
    // Clamp inside the map; center the map when it's smaller than the view
    cam.scrollX = mapW > visW ? Phaser.Math.Clamp(cam.scrollX, 0, mapW - visW) : (mapW - visW) / 2;
    cam.scrollY = mapH > visH ? Phaser.Math.Clamp(cam.scrollY, 0, mapH - visH) : (mapH - visH) / 2;

    // Minimap: upload pending cell changes, track the camera viewport
    if (this._mmDirty) {
      this._mmTex.refresh();
      this._mmDirty = false;
    }
    if (this._mmViewGfx) {
      const r = this._mmRect;
      const g = this._mmViewGfx;
      const s = r.px / TILE; // world px → minimap px
      g.clear();
      g.lineStyle(1, 0xffffff, 0.9);
      g.strokeRect(
        r.x + Math.max(0, cam.scrollX * s),
        r.y + Math.max(0, cam.scrollY * s),
        Math.min(visW * s, r.w),
        Math.min(visH * s, r.h));
    }
  }
}
