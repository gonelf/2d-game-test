class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.merged = false;
    this._mergeProgress = 0; // 0 = split, 1 = merged (used for animation)
    this._mergeTarget = 0;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.worldMap = new WorldMap(this);

    // ── Players ──────────────────────────────────────────────────────────────
    const spawnX1 = (WORLD_W / 2 - 6) * TILE;
    const spawnX2 = (WORLD_W / 2 + 8) * TILE;
    const spawnY  = Math.floor(WORLD_H / 2) * TILE;

    this.p1 = new Player(this, spawnX1, spawnY, {
      color: 0xe74c3c,
      label: 'P1',
    });
    this.p2 = new Player(this, spawnX2, spawnY, {
      color: 0x3498db,
      label: 'P2',
    });

    // ── Input ─────────────────────────────────────────────────────────────────
    this.keys1 = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.keys2 = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    });
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.spaceKey.on('down', () => this._toggleMerge());

    // ── Cameras ───────────────────────────────────────────────────────────────
    const worldW = WORLD_W * TILE;
    const worldH = WORLD_H * TILE;

    // Main camera = left half (P1)
    this.cameras.main
      .setViewport(0, 0, W / 2, H)
      .setBounds(0, 0, worldW, worldH)
      .startFollow(this.p1.gfx, true, 0.08, 0.08);

    // Second camera = right half (P2)
    this.cam2 = this.cameras.add(W / 2, 0, W / 2, H)
      .setBounds(0, 0, worldW, worldH)
      .startFollow(this.p2.gfx, true, 0.08, 0.08);

    // Divider line (rendered by UIScene)
    this._dividerX = W / 2;

    // ── Puzzle hint signs ─────────────────────────────────────────────────────
    this._addSign(
      (WORLD_W / 2 - 4) * TILE, 15 * TILE,
      'Bridge is\nbroken!\nMerge views\nto cross'
    );
    this._addSign(
      (WORLD_W / 2 + 4) * TILE, 15 * TILE,
      'Bridge is\nbroken!\nMerge views\nto cross'
    );

    // ── Notify UI scene ───────────────────────────────────────────────────────
    this.events.emit('splitMode');
  }

  _addSign(wx, wy, text) {
    // Small sign post graphic
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
      align: 'center', wordWrap: { width: 28 },
    }).setOrigin(0.5, 0.5).setDepth(6);
  }

  _toggleMerge() {
    this.merged = !this.merged;
    this._mergeTarget = this.merged ? 1 : 0;
    this.worldMap.setMerged(this.merged);

    const hint = document.getElementById('merge-hint');
    if (hint) {
      hint.innerHTML = this.merged
        ? 'Press <strong>SPACE</strong> to split views'
        : 'Press <strong>SPACE</strong> to merge views';
    }

    this.events.emit(this.merged ? 'mergedMode' : 'splitMode');
  }

  update() {
    const merged = this.merged;
    this.p1.update(this.keys1, this.worldMap, merged);
    this.p2.update(this.keys2, this.worldMap, merged);

    this._animateCameras();
  }

  _animateCameras() {
    const speed = 0.07;
    this._mergeProgress += (this._mergeTarget - this._mergeProgress) * speed;
    const t = this._mergeProgress;

    const W = this.scale.width;
    const H = this.scale.height;

    if (t < 0.01 && !this.merged) {
      // Pure split mode
      this.cameras.main.setViewport(0, 0, W / 2, H);
      this.cam2.setViewport(W / 2, 0, W / 2, H);
      this.cameras.main.stopFollow();
      this.cameras.main.startFollow(this.p1.gfx, true, 0.08, 0.08);
      this.cam2.stopFollow();
      this.cam2.startFollow(this.p2.gfx, true, 0.08, 0.08);
      return;
    }

    if (t > 0.99 && this.merged) {
      // Pure merged mode — single full-width camera centred between players
      this.cameras.main.setViewport(0, 0, W, H);
      this.cam2.setViewport(0, 0, 0, 0); // hide second camera
      // Follow midpoint of the two players
      const midX = (this.p1.x + this.p2.x) / 2;
      const midY = (this.p1.y + this.p2.y) / 2;
      this.cameras.main.centerOn(midX, midY);
      return;
    }

    // Transition: lerp viewport widths
    const splitW = W / 2;
    const fullW  = W;
    const cam1W  = Phaser.Math.Linear(splitW, fullW, t);
    const cam2W  = Phaser.Math.Linear(splitW, 0, t);

    this.cameras.main.setViewport(0, 0, cam1W, H);
    this.cam2.setViewport(cam1W, 0, cam2W, H);

    // During transition follow each player, but cam1 slowly centres
    if (this.merged) {
      const midX = (this.p1.x + this.p2.x) / 2;
      const midY = (this.p1.y + this.p2.y) / 2;
      this.cameras.main.centerOn(
        Phaser.Math.Linear(this.p1.x, midX, t),
        Phaser.Math.Linear(this.p1.y, midY, t),
      );
    }
  }
}
