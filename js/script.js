import m2d from './m2d.js';

const canvas = document.getElementById('screen');
const context = canvas.getContext('2d');

const engine = new m2d(context);

engine.loadSprite('/img/towerDefense_tilesheet.png').then(img=>{
    engine.rectangle(canvas.clientWidth/2, 470, canvas.clientWidth, 60, img, { "isStatic": true });

    engine.rectangle(100, 400, 64, 64, img)
        .sprite.define('default', 1, 1);

    engine.rectangle(150, 300, 64, 64, img)
        .sprite.define('default', 1, 1);

    engine.circle(150, 200, 40, img)
        .sprite.define('default', 18, 5);
});


engine.start(['/img/towerDefense_tilesheet.png']);
