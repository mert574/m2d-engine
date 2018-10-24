import m2d from './m2d.js';

const canvas = document.getElementById('screen');
const context = canvas.getContext('2d');

const engine = new m2d(context);

const boxA = engine.rectangle(100, 200, 80, 80);
const boxB = engine.rectangle(150, 50, 80, 80);
//const boxC = engine.circle(250, 200, 20);
const ground = engine.rectangle(canvas.clientWidth/2, 470, canvas.clientWidth, 60, { "isStatic": true });

engine.start();