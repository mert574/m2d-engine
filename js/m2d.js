import '../node_modules/matter-js/build/matter-dev.js';

export default class m2d {
    constructor(context) {
        this.context = context;
        this.engine = Matter.Engine.create();
        this.update = this.update.bind(this);
    }

    start() {
        Matter.Engine.run(this.engine);
        this.update();
    }

    draw(vertices, style='#ff0000') {
        this.context.beginPath();
        
        for (let v of vertices) {
            this.context.lineTo(v.x, v.y);
        }
    
        this.context.fillStyle = style;
        this.context.fill();
    }
    
    update() {
        this.context.fillStyle = '#000';
        this.context.fillRect(0, 0, 640, 480);
        
        for (let elem of this.engine.world.bodies) {
            this.draw(elem.vertices, elem.render.fillStyle);
        }
    
        requestAnimationFrame(this.update);
    }

    rectangle(x, y, w, h, options) {
        const rect = Matter.Bodies.rectangle(x, y, w, h, options);
        return Matter.World.add(this.engine.world, rect);
    }
}
