import './node_modules/matter-js/build/matter-dev.js';

const canvas = document.getElementById('screen');
const context = canvas.getContext('2d');
const engine = Matter.Engine.create();

const boxA = Matter.Bodies.rectangle(100, 200, 80, 80);
const boxB = Matter.Bodies.rectangle(150, 50, 80, 80);
const boxC = Matter.Bodies.circle(250, 200, 20);
const ground = Matter.Bodies.rectangle(canvas.clientWidth/2, 470, canvas.clientWidth, 60, { "isStatic": true });

Matter.World.add(engine.world, [boxA, boxB, boxC, ground]);

boxB.torque = 25;

Matter.Engine.run(engine);

function u() {
    context.fillStyle = '#000';
    context.fillRect(0, 0, 640, 480);
    
    for (let elem of engine.world.bodies) {
        draw(context, elem.vertices, elem.render.fillStyle);
    }

    requestAnimationFrame(u);
}

function draw(context, vertices, style='#ff0000') {
    context.beginPath();
    
    for (let v of vertices) {
        context.lineTo(v.x, v.y);
    }

    context.fillStyle = style;
    context.fill();
}

u();
