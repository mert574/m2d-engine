import '../node_modules/matter-js/build/matter-dev.js';
import Entity from './entity.js';
import SpriteSheet from './spritesheet.js';

export default class m2d {
    constructor(context) {
        this.context = context;
        this.engine = Matter.Engine.create();
        this.update = this.update.bind(this);
        this.entities = new Set();
    }

    start(preload=[]) {
        let counter = preload.length;

        const onload = ()=> {
            if (--counter === 0) {
                Matter.Engine.run(this.engine);
                this.update();
            }
        };

        preload.forEach(url=>{
            const i = new Image();
            i.src = url;
            i.onload = onload;
        });
    }

    update(deltaTime) {
        this.context.fillStyle = '#000';
        this.context.fillRect(0, 0, 640, 480);

        for (let elem of this.entities) {
            elem.draw(deltaTime);
        }
    
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
        const ss = new SpriteSheet(image, 64, 64);
        const body = Matter.Bodies.rectangle(x, y, w, h, options);
        const entity = new Entity(this.context, body, ss);

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
}
