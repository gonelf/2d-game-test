class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // Mutable state lives here (not the constructor) so scene.restart() resets it
    this.merged         = false;
    this._mergeProgress = 0;
    this._mergeTarget   = 0;
    this._camMode       = null;
    this.energy         = 1;     // merge energy, 0..1
    this.elapsed        = 0;     // run timer in seconds
    this.gameOver       = false;
    this.gems           = [];
    this.gemsTotal      = 0;
    this.gemsCollected  = 0;

    const W = this.scale.width;
    const H = this.scale.height;
    const worldW = WORLD_W * TILE;
    const worldH = WORLD_H * TILE;

    this.worldMap = new WorldMap(this);
    this._spawnGems();

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

    this.input.keyboard.addKey('R').on('down', () => {
      if (this.gameOver) this.scene.restart();
    });

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
    this._addSign((WORLD_W / 2 + 4) * TILE, 15 * TILE, 'Merging\ndrains\nenergy!');

    this._updateHint();

    // HUD overlay scene (only the first scene auto-starts, so launch it here)
    if (!this.scene.isActive('UIScene')) this.scene.launch('UIScene');
  }

  // ── Gems ────────────────────────────────────────────────────────────────────

  _spawnGems() {
    const midX = Math.floor(WORLD_W / 2);
    const spots = [
      // Left side
      [8, 8], [4, 30], [16, 22], [20, 6], [10, 35],
      // Right side
      [midX + 10, 10], [midX + 25, 8], [midX + 20, 25], [midX + 15, 35], [midX + 22, 33],
      // On the broken bridge — only reachable while merged
      [midX, 15], [midX + 1, 16],
    ];

    for (const [tx, ty] of spots) {
      if (tx <= 0 || ty <= 0 || tx >= WORLD_W - 1 || ty >= WORLD_H - 1) continue;
      const t = this.worldMap.data[ty][tx];
      // Skip spots that became unreachable on custom (edited) maps
      if (t === T.WALL || t === T.WATER) continue;

      const x = (tx + 0.5) * TILE;
      const y = (ty + 0.5) * TILE;
      const sprite = this.add.image(x, y, 'gem').setDepth(8);
      this.tweens.add({
        targets: sprite, y: y - 4, duration: 700, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut', delay: (tx * 37 + ty * 53) % 700,
      });
      this.gems.push({ x, y, sprite, taken: false });
    }
    this.gemsTotal = this.gems.length;
  }

  _collectGems(player) {
    for (const gem of this.gems) {
      if (gem.taken) continue;
      const dx = player.x - gem.x;
      const dy = player.y - gem.y;
      if (dx * dx + dy * dy > 18 * 18) continue;

      gem.taken = true;
      this.gemsCollected++;
      player.gems++;
      SFX.pickup();

      this.tweens.killTweensOf(gem.sprite);
      this.tweens.add({
        targets: gem.sprite, y: gem.sprite.y - 24, alpha: 0, scale: 1.6, duration: 300,
        onComplete: () => gem.sprite.destroy(),
      });

      if (this.gemsCollected >= this.gemsTotal) this._win();
    }
  }

  _win() {
    this.gameOver = true;
    SFX.win();
    this.cameras.main.flash(600, 255, 250, 180);
    this.cam2.flash(600, 255, 250, 180);
    this._updateHint();
  }

  // ── Camera filter helpers ───────────────────────────────────────────────────

  _setSplitFilters() {
    this.p2.sprite.cameraFilter = this.cameras.main.id;
    this.p2.label.cameraFilter  = this.cameras.main.id;
    this.p1.sprite.cameraFilter = this.cam2.id;
    this.p1.label.cameraFilter  = this.cam2.id;
  }

  _setMergedFilters() {
    this.p1.sprite.cameraFilter = 0;
    this.p1.label.cameraFilter  = 0;
    this.p2.sprite.cameraFilter = 0;
    this.p2.label.cameraFilter  = 0;
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

  _onGapTile(player) {
    const tx = Math.floor(player.x / TILE);
    const ty = Math.floor(player.y / TILE);
    const row = this.worldMap.data[ty];
    return row !== undefined && row[tx] === T.GAP;
  }

  _anyPlayerOnGap() {
    return this._onGapTile(this.p1) || this._onGapTile(this.p2);
  }

  _toggleMerge() {
    if (this.gameOver) return;

    if (!this.merged && this.energy < MERGE_MIN_ENERGY) {
      SFX.denied();
      this._flashHint('Not enough merge energy!');
      return;
    }
    // Splitting would strand anyone standing where the gap reappears
    if (this.merged && this._anyPlayerOnGap()) {
      SFX.denied();
      this._flashHint('Get off the bridge first!');
      return;
    }

    this.merged = !this.merged;
    this._mergeTarget = this.merged ? 1 : 0;
    this.worldMap.setMerged(this.merged);

    if (this.merged) {
      SFX.merge();
      this._setMergedFilters();
    } else {
      SFX.split();
      this._setSplitFilters();
    }
    this.cameras.main.flash(250, 180, 220, 255);
    this.cam2.flash(250, 180, 220, 255);

    this._updateHint();
  }

  // ── Bottom hint (DOM) ───────────────────────────────────────────────────────

  _updateHint() {
    const hint = document.getElementById('merge-hint');
    if (!hint) return;
    if (this.gameOver) {
      hint.innerHTML = 'Press <strong>R</strong> to play again';
      return;
    }
    hint.innerHTML = this.merged
      ? 'Press <strong>SPACE</strong> to split views · <strong>E</strong> editor'
      : 'Press <strong>SPACE</strong> to merge views · <strong>E</strong> editor';
  }

  _flashHint(msg) {
    const hint = document.getElementById('merge-hint');
    if (!hint) return;
    hint.innerHTML = `<strong>${msg}</strong>`;
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this._updateHint(), 1200);
  }

  // ── Update ───────────────────────────────────────────────────────────────────

  update() {
    const dt = this.game.loop.delta / 1000;

    if (!this.gameOver) this.elapsed += dt;

    // Merge energy: drains while merged, recharges while split
    if (this.merged) {
      this.energy = Math.max(0, this.energy - dt / MERGE_DRAIN_SECS);
      // Forced split when drained — deferred while someone stands on the gap
      if (this.energy === 0 && !this._anyPlayerOnGap()) this._toggleMerge();
    } else {
      this.energy = Math.min(1, this.energy + dt / MERGE_RECHARGE_SECS);
    }

    this.p1.update(this.keys1, this.worldMap, this.merged);
    this.p2.update(this.keys2, this.worldMap, this.merged);

    if (!this.gameOver) {
      this._collectGems(this.p1);
      this._collectGems(this.p2);
    }

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
