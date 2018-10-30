import m2d from './m2d.js';

const options = {
    "levelNames": ['top-down.json', 'side-scroll.json'],
    "currentLevel": 'top-down.json',
}
const K_SPACE = 32, K_LEFT = 37, K_RIGHT = 39, K_UP = 38, K_DOWN = 40;

const canvas = document.getElementById('screen');
const M2D = new m2d(canvas, options);

M2D.keys.addKey(K_SPACE); // space
M2D.keys.addKey(K_LEFT); // left
M2D.keys.addKey(K_RIGHT); // right
M2D.keys.addKey(K_UP); // up
M2D.keys.addKey(K_DOWN); // down

M2D.keys.addKey(78, isPressed=>{ // n
    if (isPressed) switchLevel();
});

M2D.keys.addKey(86, isPressed=>{ // v
    if (isPressed) toggleWireframe();
});

M2D.start();

M2D.beforeUpdate = function update() {
    const pos = this.player.body.position;

    for (let key of this.keys.pressedKeys()) {
        switch(key) {
            case K_LEFT:
                M2D.Body.applyForce(this.player.body, pos, {x:-0.01,y:0});
                break;
            case K_RIGHT:
                M2D.Body.applyForce(this.player.body, pos, {x:0.01,y:0});
                break;
            case K_SPACE:
                M2D.Body.applyForce(this.player.body, pos, {x:0,y:-0.01});
                break;
            case K_UP:
                M2D.Body.applyForce(this.player.body, pos, {x:0,y:-0.01});
                break;
            case K_DOWN:
                M2D.Body.applyForce(this.player.body, pos, {x:0,y:0.01});
                break;
        }
    }
}

let current = 0;
function switchLevel() {
    const len = options.levelNames.length;
    const nextIndex = (current + 1) % len;
    const nextLevel = options.levelNames[nextIndex];
    M2D.levelManager.currentLevel = nextLevel;
    current = nextIndex;

    console.log(current, nextLevel);
    M2D.reset();
}

function toggleWireframe() {
    for (let e of M2D.entities) {
        e.wireframe = !e.wireframe;
    }
}
