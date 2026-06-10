// Overlay scene: divider, HUD (mode, gems, timer, merge energy) and the victory screen.
// State is polled from GameScene every frame, so it survives GameScene restarts
// without any event listener bookkeeping.
class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.divider   = this.add.graphics();
    this.energyGfx = this.add.graphics().setDepth(100);

    this.modeLabel = this.add.text(W / 2, 8, '', {
      fontSize: '13px', fontFamily: 'monospace', color: '#fff',
      stroke: '#000', strokeThickness: 3, align: 'center',
    }).setOrigin(0.5, 0).setDepth(100);

    this.infoLabel = this.add.text(W / 2, 26, '', {
      fontSize: '11px', fontFamily: 'monospace', color: '#7ef9ff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(100);

    this.energyLabel = this.add.text(W / 2, 55, 'MERGE ENERGY', {
      fontSize: '8px', fontFamily: 'monospace', color: '#ccccdd',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(100);

    this.p1Label = this.add.text(W / 4, 12, 'P1  WASD', {
      fontSize: '11px', fontFamily: 'monospace', color: '#e74c3c',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(100);

    this.p2Label = this.add.text(W * 3 / 4, 12, 'P2  ↑↓←→', {
      fontSize: '11px', fontFamily: 'monospace', color: '#3498db',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(100);

    // Victory overlay (hidden until the game is won)
    this.victoryBg = this.add.graphics().setDepth(199).setVisible(false);
    this.victoryBg.fillStyle(0x000000, 0.65);
    this.victoryBg.fillRect(0, 0, W, H);

    this.victoryText = this.add.text(W / 2, H / 2, '', {
      fontSize: '20px', fontFamily: 'monospace', color: '#fff',
      stroke: '#000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setDepth(200).setVisible(false);
  }

  update() {
    const gs = this.scene.get('GameScene');
    if (!gs || !gs.p1) return;

    const W = this.scale.width;
    const H = this.scale.height;
    const t = gs._mergeProgress;          // 0 = split, 1 = merged
    const splitAlpha = Phaser.Math.Clamp(1 - t, 0, 1);

    this.modeLabel.setText(gs.merged ? '── MERGED ──' : '── SPLIT ──');
    this.p1Label.setAlpha(splitAlpha);
    this.p2Label.setAlpha(splitAlpha);

    const mins = Math.floor(gs.elapsed / 60);
    const secs = Math.floor(gs.elapsed % 60).toString().padStart(2, '0');
    this.infoLabel.setText(`GEMS ${gs.gemsCollected}/${gs.gemsTotal}   ${mins}:${secs}`);

    this._drawDivider(splitAlpha, W, H);
    this._drawEnergy(gs, W);
    this._updateVictory(gs, mins, secs);
  }

  _drawDivider(alpha, W, H) {
    this.divider.clear();
    if (alpha <= 0.01) return;

    this.divider.lineStyle(2, 0xffffff, alpha * 0.8);
    this.divider.lineBetween(W / 2, 0, W / 2, H);

    // Faint shadow lines
    this.divider.lineStyle(4, 0x000000, alpha * 0.3);
    this.divider.lineBetween(W / 2 - 1, 0, W / 2 - 1, H);
    this.divider.lineBetween(W / 2 + 1, 0, W / 2 + 1, H);
  }

  _drawEnergy(gs, W) {
    const bw = 140, bh = 7;
    const x = W / 2 - bw / 2;
    const y = 46;
    const g = this.energyGfx;

    g.clear();
    g.fillStyle(0x000000, 0.5);
    g.fillRect(x - 1, y - 1, bw + 2, bh + 2);

    const color = gs.energy > 0.5 ? 0x2ecc71
                : gs.energy > MERGE_MIN_ENERGY ? 0xf1c40f
                : 0xe74c3c;
    g.fillStyle(color, 1);
    g.fillRect(x, y, bw * gs.energy, bh);

    g.lineStyle(1, 0xffffff, 0.6);
    g.strokeRect(x - 1, y - 1, bw + 2, bh + 2);
  }

  _updateVictory(gs, mins, secs) {
    const show = !!gs.gameOver;
    if (show && !this.victoryText.visible) {
      this.victoryText.setText(
        'ALL GEMS COLLECTED!\n\n' +
        `Time  ${mins}:${secs}\n` +
        `P1 ${gs.p1.gems} gems · P2 ${gs.p2.gems} gems\n\n` +
        'Press R to play again'
      );
    }
    this.victoryBg.setVisible(show);
    this.victoryText.setVisible(show);
  }
}
