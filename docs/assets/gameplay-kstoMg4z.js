const version = 1;
const name = "gameplay";
const type = "level";
const title = "Doner Rhythm - Gameplay";
const world = {
  width: 1280,
  height: 720,
  gravity: {
    x: 0,
    y: 0
  }
};
const assets = {};
const prefabs = {};
const layers = [];
const gameplay = {
  version,
  name,
  type,
  title,
  world,
  assets,
  prefabs,
  layers
};
export {
  assets,
  gameplay as default,
  layers,
  name,
  prefabs,
  title,
  type,
  version,
  world
};
