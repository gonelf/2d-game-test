class Player {
  constructor(scene, x, y, config) {
    this.scene  = scene;
    this.config = config;
    this.id     = config.id; // 'p1' | 'p2' — selects this player's view layer
    this.speed  = 120;
    this.x      = x;
    this.y      = y;
    this._dir   = 'down';
    this.gems   = 0;

    // Character spritesheet (32x64) when loaded; procedural tinted fallback otherwise
    if (scene.textures.exists(config.charKey)) {
      this.texKey    = config.charKey;
      this._spriteDy = -16; // sprite centre sits above the collision point (feet)
      this._labelDy  = -50;
      this.sprite = scene.add.sprite(x, y + this._spriteDy, this.texKey, 0).setDepth(10);
    } else {
      this.texKey    = 'character';
      this._spriteDy = 0;
      this._labelDy  = -20;
      this.sprite = scene.add.sprite(x, y, this.texKey, 0)
        .setDepth(10)
        .setTint(config.color);
    }

    // Label above player
    this.label = scene.add.text(x, y + this._labelDy, config.label, {
      fontSize: '12px', fontFamily: 'monospace', color: '#fff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(11);

    this.sprite.play(`${this.texKey}-walk-down`);
  }

  update(cursors, worldMap, merged) {
    let dx = 0, dy = 0;

    if (cursors.left.isDown)  dx = -1;
    if (cursors.right.isDown) dx =  1;
    if (cursors.up.isDown)    dy = -1;
    if (cursors.down.isDown)  dy =  1;

    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

    const dt = this.scene.game.loop.delta / 1000;
    const nx = this.x + dx * this.speed * dt;
    const ny = this.y + dy * this.speed * dt;

    const r = 9;
    const id = this.id;
    const canMoveX = worldMap.isWalkable(nx + r * Math.sign(dx || 1), this.y,     merged, id) &&
                     worldMap.isWalkable(nx + r * Math.sign(dx || 1), this.y + r,  merged, id) &&
                     worldMap.isWalkable(nx + r * Math.sign(dx || 1), this.y - r,  merged, id);
    const canMoveY = worldMap.isWalkable(this.x,     ny + r * Math.sign(dy || 1), merged, id) &&
                     worldMap.isWalkable(this.x + r,  ny + r * Math.sign(dy || 1), merged, id) &&
                     worldMap.isWalkable(this.x - r,  ny + r * Math.sign(dy || 1), merged, id);

    if (dx !== 0 && canMoveX) this.x = nx;
    if (dy !== 0 && canMoveY) this.y = ny;

    this._updateAnim(dx, dy);

    this.sprite.setPosition(this.x, this.y + this._spriteDy);
    this.label.setPosition(this.x, this.y + this._labelDy);
  }

  _updateAnim(dx, dy) {
    const moving = dx !== 0 || dy !== 0;

    if (!moving) {
      if (this.sprite.anims.isPlaying) {
        this.sprite.anims.stop();
        // Show idle frame 0 of current direction
        this.sprite.setFrame(this._dirRow() * 4);
      }
      return;
    }

    // Dominant axis determines direction
    let newDir;
    if (Math.abs(dy) >= Math.abs(dx)) {
      newDir = dy > 0 ? 'down' : 'up';
    } else {
      newDir = dx > 0 ? 'right' : 'left';
    }

    if (newDir !== this._dir || !this.sprite.anims.isPlaying) {
      this._dir = newDir;
      this.sprite.play(`${this.texKey}-walk-${newDir}`, true);
    }
  }

  _dirRow() {
    return { down: 0, left: 1, right: 2, up: 3 }[this._dir];
  }

  setVisible(v) {
    this.sprite.setVisible(v);
    this.label.setVisible(v);
  }
}
