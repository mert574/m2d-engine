export default class Entity {
    constructor(context, body, spriteSheet) {
        this.body = body;
        this.sprite = spriteSheet;
        this.context = context;

        const {min, max} = this.body.bounds;

        this.size = {
            "x": max.x - min.x,
            "y": max.y - min.y
        };

        this.wireframe = false;
        this.sprite.define('default', 1, 1);
    }

    draw() {
        this.sprite.draw('default', this.context, this.body.position, this.body.angle);

        if (this.wireframe) {
            this.context.beginPath();

            const max = this.body.vertices.length-1;
            const last = this.body.vertices[max];

            this.context.moveTo(last.x, last.y);

            for (let v of this.body.vertices) {
                this.context.lineTo(v.x, v.y);
            }

            for (let i=0; i<=max; i++) {
                const v = this.body.vertices[i];
                const n = this.body.vertices[max-i];

                if (i%2 === 0) {
                    //this.context.lineTo(n.x, n.y);
                    this.context.lineTo(v.x, v.y);
                }
            }
        
            this.context.strokeStyle = this.body.render.fillStyle;
            this.context.stroke();
        }
    }
}
