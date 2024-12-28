import { Scene } from '../../../core/scene.js';
import { Button } from '../../../core/ui/Button.js';
import { Text } from '../../../core/ui/Text.js';

export class MenuScene extends Scene {
  constructor(game, config) {
    super(game, {
      ...config,
      backgroundColor: '#2c3e50'
    });
  }

  async _loadNormalScene() {
    const centerX = this.game.canvas.width / 2;
    
    const title = new Text(
      centerX,
      100,
      'Platformer Demo',
      {
        fontSize: '48px',
        align: 'center',
        color: '#ecf0f1'
      }
    );

    const buttonWidth = 200;
    const buttonHeight = 50;
    const startButton = new Button(
      centerX - buttonWidth / 2,
      200,
      buttonWidth,
      buttonHeight,
      'Start Game',
      () => {
        this.game.sceneManager.switchTo('game');
      }
    );

    startButton.backgroundColor = '#3498db';
    startButton.hoverColor = '#2980b9';
    startButton.textColor = '#ffffff';
    startButton.fontSize = '20px';

    this.ui.add(title);
    this.ui.add(startButton);
  }
}
