// BootScene.js — loads the sprite atlases (built from the CC0 Zelda-like pack
// by ArMM1998, see assets/CREDITS.md) and registers global animations.
// If the images fail to load (e.g. offline file://), procedural textures are
// generated as a fallback so the game still runs.
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    this.load.spritesheet('tiles', 'assets/tiles.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('char-p1', 'assets/char-p1.png', { frameWidth: 32, frameHeight: 64 });
    this.load.spritesheet('char-p2', 'assets/char-p2.png', { frameWidth: 32, frameHeight: 64 });
    this.load.on('loaderror', (file) => console.warn('Asset failed to load:', file.key));
  }

  create() {
    if (!this.textures.exists('tiles')) TileAtlas.generate(this);
    this._createGemTexture();

    const charKeys = ['char-p1', 'char-p2'].filter(k => this.textures.exists(k));
    if (charKeys.length < 2) {
      // Procedural white character, tinted per player
      CharacterAtlas.generate(this);
      this._createCharacterAnims('character');
    } else {
      charKeys.forEach(k => this._createCharacterAnims(k));
    }

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

  _createCharacterAnims(texKey) {
    // Frame layout: row 0=down, 1=left, 2=right, 3=up — 4 frames each
    const dirs = ['down', 'left', 'right', 'up'];
    dirs.forEach((dir, row) => {
      this.anims.create({
        key: `${texKey}-walk-${dir}`,
        frames: this.anims.generateFrameNumbers(texKey, {
          start: row * 4,
          end:   row * 4 + 3,
        }),
        frameRate: 8,
        repeat: -1,
      });
    });
  }
}
