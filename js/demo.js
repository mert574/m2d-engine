import m2d from './m2d.js';

const canvas = document.getElementById('screen');
const M2D = new m2d(canvas);

let player;

M2D.loadSprite('img/towerDefense_tilesheet.png').then(img=>{
    M2D.rectangle(canvas.clientWidth/2, 470, canvas.clientWidth, 60, img, { "isStatic": true });

    player = M2D.rectangle(100, 200, 64, 64, img);
    player.sprite.define('default', 1, 1);

    M2D.rectangle(150, 100, 96, 64, img)
        .sprite.define('default', 1, 1);

    M2D.keys.addKey(32);
    M2D.keys.addKey(37);
    M2D.keys.addKey(39);

    M2D.start();
});

M2D.beforeUpdate = function update() {
    const pos = player.body.position;

    for (let key of this.keys.pressedKeys()) {
        switch(key) {
            case 37:
                M2D.Body.applyForce(player.body, pos, {x:-0.01,y:0});
                break;
            case 39:
                M2D.Body.applyForce(player.body, pos, {x:0.01,y:0});
                break;
            case 32:
                M2D.Body.applyForce(player.body, pos, {x:0,y:-0.01});
                break;
        }
    }
}
