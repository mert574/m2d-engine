import m2d from './m2d.js';

const options = {
    "levelNames": ['top-down.json', 'side-scroll.json'],
    "currentLevel": 'top-down.json',
}

const canvas = document.getElementById('screen');
const M2D = new m2d(canvas, options);

M2D.keys.addKey(32); // space
M2D.keys.addKey(37); // left
M2D.keys.addKey(39); // right
M2D.keys.addKey(38); // up
M2D.keys.addKey(40); // down

M2D.keys.addKey(78, isPressed=>{ // n
    if (isPressed) {
        switchLevel();
    }
});

M2D.keys.addKey(86, isPressed=>{ // v
    if (isPressed) {
        toggleWireframe();
    }
});

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
            case 38:
                M2D.Body.applyForce(this.player.body, pos, {x:0,y:-0.01});
                break;
            case 40:
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