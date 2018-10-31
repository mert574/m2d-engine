import {loadSprite} from './loaders.js';

export default class LevelManager {
    constructor(options) {
        this.names = options.names;
        this.levels = [];
        this.currentLevel = null;

        let promises = [];
        for (let n of this.names) {
            const f = fetch(`${options.path}/${n}`)
                .then(r=>r.json())
                .then(j=>({...j, "name": n})); // add name field
            promises.push(f);
        }

        Promise.all(promises)
        .then(levelsData=>{
            for (let level of levelsData) { // preload
                const urls = level.sprites.map(data=>data[0]);
                loadSprite(urls);
            }

            this.levels = levelsData;
            if (options.currentLevel) {
                this.currentLevel = options.currentLevel;
            } else {
                this.currentLevel = this.levels[0].name;
            }
        }, error=>{
            throw new Error('Cannot get levels.', error);
        });
    }

    loadLevel(name) {
        const level = this.findLevel(name);
        if (!level) {
            throw new Error(`Couldn\'t find the level: ${name}`);
        }

        return new Promise((resolve, reject)=>{
            const urls = level.sprites.map(data=>data[0]);
            
            loadSprite(urls).then(images=>{
                const sprites = images.map((img, i)=>{
                    const tileSize = level.sprites[i][1];
                    return [img, tileSize];
                });

                resolve({ ...level, "sprites": sprites });
            }, reject);
        });
    }

    findLevel(name) {
        for (let level of this.levels) {
            if (level.name === name) {
                return level;
            }
        }
    }
}
