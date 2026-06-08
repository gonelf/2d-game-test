// BootScene.js — generates textures before any game scene runs.
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    TileAtlas.generate(this);
    this.scene.start('GameScene');
  }
}
