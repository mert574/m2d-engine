export default class SpriteSheet {
    constructor(image, tileW, tileH, w, h) {
        this.image = image;
        this.tileWidth = tileW;
        this.tileHeight = tileH;
        this.width = w || tileW;
        this.height = h || tileH;
        this.tiles = new Map();
    }

    define(name, x, y) {
        const buffer = document.createElement('canvas');
        buffer.height = this.tileHeight;
        buffer.width = this.tileWidth;
        buffer
            .getContext('2d')
            .drawImage(
                this.image,
                this.tileWidth * x, this.tileHeight * y,
                this.tileWidth, this.tileHeight,
                0, 0,
                this.width, this.height
            );
        this.tiles.set(name, buffer);
    }

    draw(name, context, position, angle=0) {
        const buffer = this.tiles.get(name);

        context.translate(position.x, position.y);
        context.rotate(angle);

        context.drawImage(buffer, 
            0,0,
            this.tileWidth, this.tileHeight,
            -this.width/2, -this.height/2,
            this.width, this.height
        );

        context.rotate(-angle);
        context.translate(-position.x, -position.y);
    }
}
