class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.merged = false;
    this._mergeProgress = 0;
    this._mergeTarget = 0;
    this._camMode = null;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const worldW = WORLD_W * TILE;
    const worldH = WORLD_H * TILE;

    this.worldMap = new WorldMap(this);

    // Spawn players with enough room to see their side of the world
    const spawnX1 = (WORLD_W / 2 - 8) * TILE;
    const spawnX2 = (WORLD_W / 2 + 8) * TILE;
    const spawnY  = Math.floor(WORLD_H / 2) * TILE;

    this.p1 = new Player(this, spawnX1, spawnY, { color: 0xe74c3c, label: 'P1' });
    this.p2 = new Player(this, spawnX2, spawnY, { color: 0x3498db, label: 'P2' });

    // ── Input ─────────────────────────────────────────────────────────────────
    this.keys1 = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.keys2 = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    });
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.spaceKey.on('down', () => this._toggleMerge());

    // ── Editor key ────────────────────────────────────────────────────────────
    this.input.keyboard.addKey('E').on('down', () => {
      this.scene.pause();
      this.scene.pause('UIScene');
      this.scene.launch('EditorScene');
    });

    // ── Cameras — no startFollow; positions managed manually each frame ───────
    this.cameras.main
      .setViewport(0, 0, W / 2, H)
      .setBounds(0, 0, worldW, worldH);

    this.cam2 = this.cameras.add(W / 2, 0, W / 2, H)
      .setBounds(0, 0, worldW, worldH);

    // ── Camera filters: each camera only sees its own player ──────────────────
    this._setSplitFilters();

    // ── Signs ─────────────────────────────────────────────────────────────────
    this._addSign((WORLD_W / 2 - 4) * TILE, 15 * TILE, 'Bridge\nbroken!\nMerge\nviews');
    this._addSign((WORLD_W / 2 + 4) * TILE, 15 * TILE, 'Bridge\nbroken!\nMerge\nviews');

    this.events.emit('splitMode');
  }

  // ── Camera filter helpers ───────────────────────────────────────────────────

  _setSplitFilters() {
    // cam1 (id=1) must NOT render P2; cam2 (id=2) must NOT render P1
    this.p2.gfx.cameraFilter   = this.cameras.main.id;
    this.p2.label.cameraFilter = this.cameras.main.id;
    this.p1.gfx.cameraFilter   = this.cam2.id;
    this.p1.label.cameraFilter = this.cam2.id;
  }

  _setMergedFilters() {
    // cam1 is now full-screen; both players should be visible
    this.p1.gfx.cameraFilter   = 0;
    this.p1.label.cameraFilter = 0;
    this.p2.gfx.cameraFilter   = 0;
    this.p2.label.cameraFilter = 0;
  }

  // ── Signs ───────────────────────────────────────────────────────────────────

  _addSign(wx, wy, text) {
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(0x8d6e63, 1);
    g.fillRect(-2, 0, 4, 16);
    g.fillStyle(0xfff9c4, 1);
    g.fillRect(-16, -32, 32, 30);
    g.lineStyle(2, 0x5d4037, 1);
    g.strokeRect(-16, -32, 32, 30);
    g.setPosition(wx, wy);

    this.add.text(wx, wy - 18, text, {
      fontSize: '8px', fontFamily: 'monospace', color: '#333',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(6);
  }

  // ── Toggle ──────────────────────────────────────────────────────────────────

  _toggleMerge() {
    this.merged = !this.merged;
    this._mergeTarget = this.merged ? 1 : 0;
    this.worldMap.setMerged(this.merged);

    if (this.merged) {
      this._setMergedFilters();
    } else {
      this._setSplitFilters();
    }

    const hint = document.getElementById('merge-hint');
    if (hint) {
      hint.innerHTML = this.merged
        ? 'Press <strong>SPACE</strong> to split views'
        : 'Press <strong>SPACE</strong> to merge views';
    }
    this.events.emit(this.merged ? 'mergedMode' : 'splitMode');
  }

  // ── Update ───────────────────────────────────────────────────────────────────

  update() {
    this.p1.update(this.keys1, this.worldMap, this.merged);
    this.p2.update(this.keys2, this.worldMap, this.merged);
    this._animateCameras();
  }

  // Smoothly scroll a camera so its centre approaches (cx, cy).
  _lerpCam(cam, cx, cy, vw, vh) {
    const tx = cx - vw / 2;
    const ty = cy - vh / 2;
    cam.scrollX += (tx - cam.scrollX) * 0.1;
    cam.scrollY += (ty - cam.scrollY) * 0.1;
  }

  _animateCameras() {
    const W = this.scale.width;
    const H = this.scale.height;

    this._mergeProgress += (this._mergeTarget - this._mergeProgress) * 0.07;
    const t = this._mergeProgress;

    const midX = (this.p1.x + this.p2.x) / 2;
    const midY = (this.p1.y + this.p2.y) / 2;

    // ── Fully merged ──────────────────────────────────────────────────────────
    if (t > 0.99 && this.merged) {
      if (this._camMode !== 'merged') {
        this.cam2.setViewport(W * 2, 0, 1, H); // park cam2 off-screen
        this._camMode = 'merged';
      }
      this.cameras.main.setViewport(0, 0, W, H);
      this._lerpCam(this.cameras.main, midX, midY, W, H);
      return;
    }

    // ── Fully split ───────────────────────────────────────────────────────────
    if (t < 0.01 && !this.merged) {
      if (this._camMode !== 'split') {
        this.cameras.main.setViewport(0, 0, W / 2, H);
        this.cam2.setViewport(W / 2, 0, W / 2, H);
        this._camMode = 'split';
      }
      this._lerpCam(this.cameras.main, this.p1.x, this.p1.y, W / 2, H);
      this._lerpCam(this.cam2,         this.p2.x, this.p2.y, W / 2, H);
      return;
    }

    // ── Transition ────────────────────────────────────────────────────────────
    const w1 = Phaser.Math.Linear(W / 2, W, t);
    const w2 = Phaser.Math.Linear(W / 2, 0, t);

    this.cameras.main.setViewport(0, 0, w1, H);
    this.cam2.setViewport(w1, 0, w2, H);

    const c1x = Phaser.Math.Linear(this.p1.x, midX, t);
    const c1y = Phaser.Math.Linear(this.p1.y, midY, t);
    const c2x = Phaser.Math.Linear(this.p2.x, midX, t);
    const c2y = Phaser.Math.Linear(this.p2.y, midY, t);

    this._lerpCam(this.cameras.main, c1x, c1y, w1, H);
    this._lerpCam(this.cam2,         c2x, c2y, w2, H);
  }
}
