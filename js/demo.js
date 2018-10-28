import m2d from './m2d.js';

const canvas = document.getElementById('screen');
const M2D = new m2d(canvas, ['1-1.json']);

M2D.keys.addKey(32);
M2D.keys.addKey(37);
M2D.keys.addKey(39);

M2D.start();

M2D.beforeUpdate = function update() {
    const pos = this.player.body.position;

    for (let key of this.keys.pressedKeys()) {
        switch(key) {
            case 37:
                M2D.Body.applyForce(this.player.body, pos, {x:-0.01,y:0});
                break;
            case 39:
                M2D.Body.applyForce(this.player.body, pos, {x:0.01,y:0});
                break;
            case 32:
                M2D.Body.applyForce(this.player.body, pos, {x:0,y:-0.01});
                break;
        }
    }
}
