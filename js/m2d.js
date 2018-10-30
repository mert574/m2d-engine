import './matter-dev.js';
import Entity from './entity.js';
import SpriteSheet from './spritesheet.js';
import KeyStates from './keystate.js';
import LevelManager from './levelmanager.js';
import LayerManager from './layermanager.js';

const defaultOptions = {
    "levelsPath": 'levels',
    "levelNames": undefined,
    "levelsPath": 'levels',
}

const defaultEntityOptions = {
}

export default class M2D {
    constructor(canvas, options) {
        this.options = { ...defaultOptions, ...options }

        this.canvas = canvas;
        this.width = canvas.clientWidth;
        this.height = canvas.clientHeight;
        this.context = canvas.getContext('2d');
        
        this.update = this.update.bind(this);
        this.entities = new Set();
        this.player = null;

        this.Body = Matter.Body;
        this.World = Matter.World;

        this.init();
    }

    init() {
        this.engine = Matter.Engine.create();
        this.mouse = Matter.Mouse.create(this.canvas);

        const MouseConstraint = Matter.MouseConstraint.create(this.engine, { "mouse": this.mouse });
        this.keys = new KeyStates(MouseConstraint, Matter.Events.on);

        this.layers = new LayerManager(this.context);

        this.levelManager = new LevelManager({
            "names": this.options.levelNames,
            "path": this.options.levelsPath,
            "currentLevel": this.options.currentLevel });
    }

    reset() {
        Matter.World.clear(this.engine.world);
        Matter.Engine.clear(this.engine);
        this.entities.clear();

        this.start(true);
    }

    start(restarted=false) {
        const waitUntilLoaded = () => {
            if (this.levelManager.currentLevel) {
                this.levelManager.loadLevel(this.levelManager.currentLevel).then(level=>{
                    this.parseLevel(level);

                    if (!restarted) this.update();
                    console.log('loaded level:', level.name, level.entities.length+1, this.entities.size);
                });
            } else {
                requestAnimationFrame(waitUntilLoaded);
            }
        }

        waitUntilLoaded();
    }

    parseLevel(level) {
        if (level.gameType === 'topDown') {
            this.engine.world.gravity.y = 0;
            defaultEntityOptions.frictionAir = 0.2;
        } else {
            this.engine.world.gravity.y = 1;
            defaultEntityOptions.frictionAir = 0.01;
        }

        if (level.background) { // background layer
            const [i, x, y] = level.background;
            const image = level.sprites[i];
            const tileSize = 64; // fix this
            const tileCountX = Math.ceil(this.width / tileSize);
            const tileCountY = Math.ceil(this.height / tileSize);

            const sprite = new SpriteSheet(image, tileSize, tileSize);
            sprite.define('default', x, y);

            const bgLayer = this.layers.constructLayer(sprite, tileCountX, tileCountY, tileSize, {"anim": 'default'});

            this.layers.addLayer('background', bgLayer);
        }

        // entitites
        for (let [x, y, w, h, spriteIndex, anims, options] of level.entities) {
            const sprite = level.sprites[spriteIndex];
            this.parseEntity(x, y, w, h, sprite, anims, options);
        }

        const [x, y, w, h, spriteIndex, anims] = level.player;
        const sprite = level.sprites[spriteIndex];
        this.player = this.parseEntity(x, y, w, h, sprite, anims);
    }

    parseEntity(x, y, w, h, sprite, anims, options) {
        const entity = this.rectangle(x, y, w, h, sprite, options);
        
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

        Matter.Engine.update(this.engine);

        this.layers.draw();

        for (let elem of this.entities) {
            elem.draw(deltaTime);
        }
    
        this.afterUpdate(deltaTime);
        requestAnimationFrame(this.update);
    }

    rectangle(x, y, w, h, image, options) {
        options = { ...defaultEntityOptions, ...options };

        const body = Matter.Bodies.rectangle(x, y, w, h, options);
        const sprite = new SpriteSheet(image, 64, 64, w, h);
        const entity = new Entity(this.context, body, sprite);

        this.entities.add(entity);
        Matter.World.add(this.engine.world, body);

        return entity;
    }

    circle(x, y, r, image, options) {
        options = { ...defaultEntityOptions, ...options };

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
