import { M as M2D, a as Matter, S as SettingsMenu } from "./settingsMenu-BRSbyVHp.js";
import { E as Entity } from "./entity-l-Ak0laZ.js";
const ballSprite = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAACw0lEQVRYheWXTU8TURSGnzMzlc8qaNSAbIyJEncItBhhAVTijkgCiW78IbJSfokL4wYTlootHwb5UuOOmGg0UdBoEKKUj7ZzjwvCONChtLWw4V3NnXvmvE/vnHPvFI67JN9ABVnvjF4zFr2C6QCpAxq2J+ULYr4rTFpqj1QlZt6WDEBB1mKt/aLyELicZ973igxWx2eHBbRogNWu5kuOOI9BI3ka75LCjGNzt+L53KeCAX7Hou2W6jBwrhhzn5ZVGQgn5hJ5A/zpjnYK+gwI/af5jlJqaU94dH7iQICNnshFN8MswtkSme9o2XXttlPj0x/8Nx3/QEGSrjxBdJd52lVWkhk2MwaAcseitsohZOfdRABnLNt9pHDDX5iWP2Ktu3Vgb8FtZZTF1TTJlME14BpIpgyLq2m2MjkLPEsC19di0T7/PQ9AQQR5sPehlWQG1Wwj1e1VKVRiGAoEWL8ZaSagzzdz/Mpcc/sTaGMy1tKUBWBc6S08W3EyWJ6XByBi2oOCy0P7F1quuVwSpSMLAORCUHBtpb27Un0P1lbaRQEAnpfXhgJ1QW+0zLGorznBr40MW+ntiLKQcLrCIeQUuQJBAJrj0Ag5wvlwqTZFUDA71/7V/VYyhwMJZCkIYPHIAESzARR9eWT+iHcoeQCW2iNHBaBGPS+vjBUk2R1ZAK4csv9CdXzu6s7g30YEqsjgIZtjKff9412NrCBr3ZFXAm2HYS4qU5WJ2Y59j2MBdVzrDsrPQ/BfTpO5t/cjNWuXrRif+ay29gOpEpqnDNyuSbz5uHciaJsnPDo/YYzpAn6UwHxZkVsn43OBbR4IAHBy7PWUbdOmMF2ss6hM2a7VEo7Pju0bc1CS7T8m0T4xDCHamKf3gooOhl/MPz0QMs+EACRjLU0Gq1eUDlTqRbQBQFW+IrokyqTaOlI9Ov+ukLzHW38BznX63wNFsq4AAAAASUVORK5CYII=";
const boxSprite = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAAVElEQVRYhWNgGOmAEcb4v4DhP10tToDYzURPS7GBUQew4JRRZKeuTfd/YhUe8BAYdcCoA0YdMOqAUQeMOmDUAaMOGHUA7jYhjjYctcGAh8CoA0YBANUoBxS2oGy/AAAAAElFTkSuQmCC";
const platformSprite = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAASElEQVRYhe3QMREAIBADwcB8QYUF5nXiBmN4oKIDGWkuBrJzZY71ZFx1ngOQpMjWrQB7AQAAAAAAAAAAAAAAAMS+xwqwFwDwAcb/BX+lM18tAAAAAElFTkSuQmCC";
class BouncingBall extends Entity {
  constructor(body, sprite, game2) {
    const circle = Matter.Bodies.circle(body.position.x, body.position.y, 16, {
      restitution: 0.8,
      friction: 5e-3,
      frictionAir: 1e-3
    });
    super(circle, sprite, game2);
  }
}
class Ramp extends Entity {
  constructor(body, sprite, game2, options = {}) {
    super(body, sprite, game2);
    Matter.Body.setAngle(body, options.angle || 0);
  }
}
const game = new M2D(document.getElementById("screen"), {
  initialScene: "physics",
  width: 640,
  height: 480,
  worldWidth: 640,
  worldHeight: 480
});
game.camera.x = 320;
game.camera.y = 240;
game.registerActor("Ball", BouncingBall);
game.registerActor("Box", Entity);
game.registerActor("Ramp", Ramp);
game.sceneManager.addScene("physics", {
  fetch: async () => ({
    version: 1,
    name: "physics",
    type: "level",
    gameType: "sideScroll",
    world: { width: 640, height: 480, gravity: { x: 0, y: 1 } },
    assets: { spritesheets: {
      ball: { url: ballSprite, frameWidth: 32, frameHeight: 32 },
      box: { url: boxSprite, frameWidth: 32, frameHeight: 32 },
      platform: { url: platformSprite, frameWidth: 32, frameHeight: 32 }
    } },
    prefabs: {
      ball: { actor: "Ball", spritesheet: "ball", physics: { bodyType: "dynamic" } },
      box: { actor: "Box", spritesheet: "box", physics: { bodyType: "dynamic", restitution: 0.6 } },
      platform: { actor: "Ramp", spritesheet: "platform", physics: { bodyType: "static" } }
    },
    layers: [{ name: "playground", objects: [
      { prefab: "platform", x: 320, y: 450, width: 640, height: 32 },
      { prefab: "platform", x: 150, y: 350, width: 200, height: 20, properties: { angle: Math.PI * 0.15 } },
      { prefab: "platform", x: 490, y: 350, width: 200, height: 20, properties: { angle: -Math.PI * 0.15 } },
      { prefab: "platform", x: 16, y: 240, width: 32, height: 480 },
      { prefab: "platform", x: 624, y: 240, width: 32, height: 480 },
      { prefab: "ball", x: 100, y: 100, width: 32, height: 32 },
      { prefab: "ball", x: 200, y: 150, width: 32, height: 32 },
      { prefab: "box", x: 400, y: 100, width: 40, height: 40 },
      { prefab: "box", x: 500, y: 150, width: 40, height: 40 }
    ] }]
  })
});
game.keys.addKey(" ", (pressed) => {
  const scene = game.sceneManager.getCurrentScene();
  if (!pressed || game.sceneManager.loading || !scene) return;
  const isBox = Math.random() > 0.5;
  const size = isBox ? 40 : 32;
  const sprite = scene.spriteSheets.get(isBox ? "box" : "ball");
  const entity = game.createEntity(
    isBox ? "Box" : "Ball",
    120 + Math.random() * 400,
    50,
    size,
    size,
    sprite,
    {},
    { restitution: isBox ? 0.6 : 0.8 }
  );
  entity.setAnimation("default");
  game.entities.add(entity);
  Matter.Composite.add(game.engine.world, entity.body);
});
new SettingsMenu(game);
game.start();
