import './matter-dev.js';
import Entity from './entity.js';
import SpriteSheet from './spritesheet.js';
import KeyStates from './keystate.js';

export default class M2D {
    constructor(canvas) {
        this.context = canvas.getContext('2d');
        this.engine = Matter.Engine.create();
        this.update = this.update.bind(this);
        this.entities = new Set();

        this.mouse = Matter.Mouse.create(canvas);
        const MouseConstraint = Matter.MouseConstraint.create(this.engine, { "mouse": this.mouse });
        this.keys = new KeyStates(MouseConstraint, Matter.Events.on);
        
        this.Body = Matter.Body;
        this.World = Matter.World;
    }

    start() {
        Matter.Engine.run(this.engine);
        this.update();
    }

    beforeUpdate(deltaTime) {

    }

    afterUpdate(deltaTime) {

    }

    update(deltaTime) {
        this.beforeUpdate(deltaTime);

        this.context.fillStyle = '#000';
        this.context.fillRect(0, 0, 640, 480);

        for (let elem of this.entities) {
            elem.draw(deltaTime);
        }
    
        this.afterUpdate(deltaTime);
        requestAnimationFrame(this.update);
    }

    loadSprite(url) {
        return new Promise((resolve, reject)=>{
            const img = new Image();
            img.src = url;

            img.onerror = e=>reject(img, e);
            img.onload = ()=>resolve(img);
        })
    }

    rectangle(x, y, w, h, image, options) {
        const body = Matter.Bodies.rectangle(x, y, w, h, options);

        const sprite = new SpriteSheet(image, 64, 64, w, h);
        const entity = new Entity(this.context, body, sprite);

        this.entities.add(entity);
        Matter.World.add(this.engine.world, body);

        return entity;
    }

    circle(x, y, r, image, options) {
        const body = Matter.Bodies.circle(x, y, r, options);

        const sprite = new SpriteSheet(image, 64, 64, r, r);
        const entity = new Entity(this.context, body, sprite);

        this.entities.add(entity);
        Matter.World.add(this.engine.world, body);

        return entity;
    }

    collides(body, others) {
        return Matter.Query.collides(body, others);
    }
}
