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
            for (let l of levelsData) { // preload
                loadSprite(l.sprites);
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

            let promises = [];
            for (let s of level.sprites) {
                const p = loadSprite(s);
                promises.push(p);
            };

            Promise.all(promises).then(sprites=>{
                resolve({
                    ...level,
                    "sprites": sprites[0]
                })
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
