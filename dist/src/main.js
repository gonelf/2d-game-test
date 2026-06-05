const config = {
  type: Phaser.AUTO,
  width: 1024,
  height: 576,
  backgroundColor: '#000000',
  scene: [GameScene, UIScene],
  physics: { default: 'arcade' },
  parent: document.body,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
