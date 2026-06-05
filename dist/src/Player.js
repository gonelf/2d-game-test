class Player {
  constructor(scene, x, y, config) {
    this.scene = scene;
    this.config = config; // { color, keys, label }
    this.speed = 120;

    // Graphics-based sprite (no texture assets needed)
    this.gfx = scene.add.graphics().setDepth(10);
    this._draw();

    // Position in world pixels (centre of player)
    this.x = x;
    this.y = y;
    this.gfx.setPosition(x, y);

    // Label above player
    this.label = scene.add.text(x, y - 24, config.label, {
      fontSize: '12px', fontFamily: 'monospace', color: '#fff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(11);
  }

  _draw() {
    const { color } = this.config;
    const g = this.gfx;
    g.clear();
    // Body
    g.fillStyle(color, 1);
    g.fillRect(-10, -10, 20, 20);
    // Eyes
    g.fillStyle(0xffffff, 1);
    g.fillRect(-6, -6, 4, 4);
    g.fillRect(2, -6, 4, 4);
    // Outline
    g.lineStyle(2, 0x000000, 0.8);
    g.strokeRect(-10, -10, 20, 20);
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

    // Collision: check corners of player bounding box (20×20)
    const r = 9;
    const canMoveX = worldMap.isWalkable(nx + r * Math.sign(dx || 1), this.y, merged) &&
                     worldMap.isWalkable(nx + r * Math.sign(dx || 1), this.y + r, merged) &&
                     worldMap.isWalkable(nx + r * Math.sign(dx || 1), this.y - r, merged);
    const canMoveY = worldMap.isWalkable(this.x, ny + r * Math.sign(dy || 1), merged) &&
                     worldMap.isWalkable(this.x + r, ny + r * Math.sign(dy || 1), merged) &&
                     worldMap.isWalkable(this.x - r, ny + r * Math.sign(dy || 1), merged);

    if (dx !== 0 && canMoveX) this.x = nx;
    if (dy !== 0 && canMoveY) this.y = ny;

    this.gfx.setPosition(this.x, this.y);
    this.label.setPosition(this.x, this.y - 14);
  }

  setVisible(v) {
    this.gfx.setVisible(v);
    this.label.setVisible(v);
  }
}
