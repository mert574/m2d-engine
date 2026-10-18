var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { M as M2D } from "./m2d-BNRWOeom.js";
import { E as Entity } from "./entity-D3ytQWr6.js";
import { P as Platform, K as KeyboardControl } from "./keyboardControl-BNR0DhL_.js";
const playerSprite = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAACf0lEQVRYhe2WTU8TURSGnzN32hpKJxESkI+YIiz4K0oiuNGF7IwxQETjwqUGfwKJEBckJrglBoT4U9xogVA1sOwAhjIzx0WraTp3OlNwJ28ymzln7vvcrzMHrvS/S7pJvvXu100Ng2lgCiiDjDYiWgX2ELadyGx+W+g5+KcAo6unIzkNXwGPAJOSHgEbKsHLvbnre5cGKK/UZgRZB3qzwLbIB53dnfe2OiU5Hc3fHj8TZOMC5gAlkI/lVX+xU1LiCjRnvpEGmUER6L2klbACTCyfjoZu+IWLzdwmPwidyYOnxR/tAdeWHbjRG0kyVyX0fcKTY6J6HQAnn8cUezGlEoh1TiXXREvA4/ZALLt51SrYTnsQcHZ0iDaNY4Pl8xQGBsG1zis0gSl/Xeyptr6M7W8UBTNWc9WO5gBar3N2dAiqtrAJ3XC6/WUMQFRvW/F9v6N5K0To+/aY6p1UAJAJK8DJcap5Wq6IjGcA4Ibt4yyzz5A7kgXg8kqur1EWgNhdhcYJz+yfS8jV+NgWAK3YvjXF7DUpKVctY8cBRHasg5ZKmVZB8vlGQbLIcWQ7FcCJzCYQWsAoDAx2hPhbiOzVMHDOzadUgEYzIe+tDq5LYWiYXF8/TqGAiDSeawVyff0UhoaTqiCirLVXQUj4F5yL8zqn4X0gvpYiGM/DeJ7VKEG10HWWbAHrNazO9XyPcB5g24ruFaE6u/+k+DMzAMD+fPGzCi+w3N2uzOH57oIX2/s/Sm3JxlZqd0E+YNuOzqqJ6MPKnBc7+a1KrYS7896WCRhHWQaCDMYR6HpknMk0c+iyLW92StOCTqnKGEKjLVeqilYcZMcJzZbttF/pSkn6De0s3jhjSW/PAAAAAElFTkSuQmCC";
const wallSprite = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAARElEQVRYhWN0jUr5z4AEpJXVGWgJnt69icJnoqltRIBRB4w6YNQBow4YdcCoA0YdMOqAUQeMOmDUAaMOGHXAqANGHQAAot4FQgHvppEAAAAASUVORK5CYII=";
class MazePlayer extends Entity {
  constructor(body, sprite, game2) {
    super(body, sprite, game2);
    __publicField(this, "name", "Player");
    this.addConstraint("movement", new KeyboardControl(this, { verticalMovement: true, maxSpeed: 3 }));
  }
}
const game = new M2D(document.getElementById("screen"), {
  initialScene: "maze",
  width: 640,
  height: 480,
  worldWidth: 640,
  worldHeight: 480
});
game.camera.bounds = { left: 0, top: 0, right: 640, bottom: 480 };
game.registerActor("MazePlayer", MazePlayer);
game.registerActor("Platform", Platform);
const walls = [
  [320, 16, 640, 32],
  [320, 464, 640, 32],
  [16, 240, 32, 480],
  [624, 240, 32, 480],
  [200, 150, 32, 200],
  [400, 300, 32, 200],
  [300, 200, 200, 32],
  [100, 350, 200, 32]
];
game.sceneManager.addScene("maze", {
  fetch: async () => ({
    version: 1,
    name: "maze",
    type: "level",
    gameType: "topDown",
    world: { width: 640, height: 480, gravity: { x: 0, y: 0 } },
    assets: { spritesheets: {
      player: { url: playerSprite, frameWidth: 32, frameHeight: 32 },
      wall: { url: wallSprite, frameWidth: 32, frameHeight: 32 }
    } },
    prefabs: {
      player: { actor: "MazePlayer", spritesheet: "player", physics: { bodyType: "dynamic", frictionAir: 0.2 } },
      wall: { actor: "Platform", spritesheet: "wall", physics: { bodyType: "static" } }
    },
    layers: [{ name: "maze", objects: [
      { prefab: "player", x: 64, y: 64, width: 32, height: 32 },
      ...walls.map(([x, y, width, height]) => ({ prefab: "wall", x, y, width, height }))
    ] }]
  })
});
game.start();
