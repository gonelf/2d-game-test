// BootScene.js — generates textures and registers global animations before any game scene runs.
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    TileAtlas.generate(this);
    CharacterAtlas.generate(this);
    this._createCharacterAnims();
    this.scene.start('GameScene');
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
