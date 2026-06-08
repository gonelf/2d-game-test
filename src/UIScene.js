// Overlay scene: renders the divider line and mode label on top of the game.
class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.divider = this.add.graphics();
    this.modeLabel = this.add.text(W / 2, 12, '', {
      fontSize: '13px', fontFamily: 'monospace', color: '#fff',
      stroke: '#000', strokeThickness: 3, align: 'center',
    }).setOrigin(0.5, 0).setDepth(100);

    this.p1Label = this.add.text(W / 4, 12, 'P1  WASD', {
      fontSize: '11px', fontFamily: 'monospace', color: '#e74c3c',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(100);

    this.p2Label = this.add.text(W * 3 / 4, 12, 'P2  ↑↓←→', {
      fontSize: '11px', fontFamily: 'monospace', color: '#3498db',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(100);

    const gameScene = this.scene.get('GameScene');
    gameScene.events.on('splitMode', () => {
      this.modeLabel.setText('── SPLIT ──');
      this.p1Label.setVisible(true);
      this.p2Label.setVisible(true);
      this._showDivider = true;
    });
    gameScene.events.on('mergedMode', () => {
      this.modeLabel.setText('── MERGED ──');
      this.p1Label.setVisible(false);
      this.p2Label.setVisible(false);
      this._showDivider = false;
    });

    this._showDivider = true;
    this._dividerAlpha = 1;
    this.modeLabel.setText('── SPLIT ──');
  }

  update() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Animate divider alpha
    const target = this._showDivider ? 1 : 0;
    this._dividerAlpha += (target - this._dividerAlpha) * 0.06;

    this.divider.clear();
    if (this._dividerAlpha > 0.01) {
      this.divider.lineStyle(2, 0xffffff, this._dividerAlpha * 0.8);
      this.divider.lineBetween(W / 2, 0, W / 2, H);

      // Faint shadow lines
      this.divider.lineStyle(4, 0x000000, this._dividerAlpha * 0.3);
      this.divider.lineBetween(W / 2 - 1, 0, W / 2 - 1, H);
      this.divider.lineBetween(W / 2 + 1, 0, W / 2 + 1, H);
    }
  }
}
