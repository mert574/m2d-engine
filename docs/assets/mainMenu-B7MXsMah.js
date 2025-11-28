const version = 1;
const name = "mainMenu";
const type = "ui";
const title = "Main Menu";
const assets = {};
const elements = [
  {
    type: "rect",
    id: "background",
    x: 640,
    y: 480,
    width: 1280,
    height: 960,
    color: "#1a1a2e"
  },
  {
    type: "text",
    id: "title",
    x: 640,
    y: 200,
    properties: {
      text: "Top-Down Demo",
      fontSize: "128px",
      align: "center",
      color: "#eaeaea"
    }
  },
  {
    type: "button",
    id: "startGame",
    x: 640,
    y: 400,
    properties: {
      text: "Start Game",
      onClick: "level1",
      width: 200,
      height: 50,
      fontSize: "24px",
      backgroundColor: "#0f3460",
      hoverColor: "#16213e",
      textColor: "#eaeaea"
    }
  }
];
const mainMenu = {
  version,
  name,
  type,
  title,
  assets,
  elements
};
export {
  assets,
  mainMenu as default,
  elements,
  name,
  title,
  type,
  version
};
