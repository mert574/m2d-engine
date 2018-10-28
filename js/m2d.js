import './matter-dev.js';
import Entity from './entity.js';
import SpriteSheet from './spritesheet.js';
import KeyStates from './keystate.js';
import LevelManager from './levelmanager.js';

export default class M2D {
    constructor(canvas, levelNames, levelsPath='../levels') {
        this.width = canvas.clientWidth;
        this.height = canvas.clientHeight;

        this.context = canvas.getContext('2d');
        this.engine = Matter.Engine.create();
        this.update = this.update.bind(this);
        this.entities = new Set();
        this.player = null;

        this.mouse = Matter.Mouse.create(canvas);
        const MouseConstraint = Matter.MouseConstraint.create(this.engine, { "mouse": this.mouse });
        this.keys = new KeyStates(MouseConstraint, Matter.Events.on);

        this.levelManager = new LevelManager(levelNames, levelsPath);

        this.Body = Matter.Body;
        this.World = Matter.World;
    }

    start() {
        const waitUntilLoaded = () => {
            if (this.levelManager.levels.length) {
                this.levelManager.loadLevel(this.levelManager.names[0]).then(level=>{
                    console.log(`Loaded level: ${level.name}\n`, level);
                    
                    this.rectangle(this.width/2, 470, this.width, 60, level.sprites[0], { "isStatic": true })
                        .sprite.define('default', 1, 1);

                    for (let [x, y, w, h, spriteIndex, anims] of level.entities) {
                        const sprite = level.sprites[spriteIndex];
                        this.parseEntity(x, y, w, h, sprite, anims);
                    }

                    const [x, y, w, h, spriteIndex, anims] = level.player;
                    const sprite = level.sprites[spriteIndex];
                    this.player = this.parseEntity(x, y, w, h, sprite, anims);

                    Matter.Engine.run(this.engine);
                    this.update();
                });
            } else {
                requestAnimationFrame(waitUntilLoaded);
            }
        }

        waitUntilLoaded();
    }

    parseEntity(x, y, w, h, sprite, anims) {
        const entity = this.rectangle(x, y, w, h, sprite);
        
        for (let a of anims) {
            const [name, tileX, tileY] = a;
            entity.sprite.define(name, tileX, tileY);
        }

        return entity;
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
