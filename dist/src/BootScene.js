// BootScene.js — generates textures and registers global animations before any game scene runs.
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    TileAtlas.generate(this);
    CharacterAtlas.generate(this);
    this._createGemTexture();
    this._createCharacterAnims();
    this.scene.start('GameScene');
  }

  _createGemTexture() {
    const S  = 18;
    const ct  = this.textures.createCanvas('gem', S, S);
    const ctx = ct.getContext('2d');

    // Diamond body
    ctx.fillStyle = '#7ef9ff';
    ctx.beginPath();
    ctx.moveTo(9, 1);
    ctx.lineTo(16, 7);
    ctx.lineTo(9, 17);
    ctx.lineTo(2, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,60,90,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Facet highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, 5);
    ctx.lineTo(9, 8);
    ctx.lineTo(13, 5);
    ctx.stroke();

    ct.refresh();
  }

  _createCharacterAnims() {
    // Frame layout: row 0=down, 1=left, 2=right, 3=up — 4 frames each
    const dirs = ['down', 'left', 'right', 'up'];
    dirs.forEach((dir, row) => {
      this.anims.create({
        key: `walk-${dir}`,
        frames: this.anims.generateFrameNumbers('character', {
          start: row * 4,
          end:   row * 4 + 3,
        }),
        frameRate: 8,
        repeat: -1,
      });
    });
  }
}
