const version = 1;
const name = "mainMenu";
const type = "ui";
const title = "Main Menu";
const assets = {};
const elements = [
  {
    type: "rect",
    id: "background",
    x: 0,
    y: 0,
    fill: true,
    color: "#298ccc"
  },
  {
    type: "text",
    id: "title",
    anchor: "center",
    x: 0,
    y: -280,
    properties: {
      text: "Platformer Demo",
      fontSize: "128px",
      align: "center",
      color: "#ffffff"
    }
  },
  {
    type: "button",
    id: "startGame",
    anchor: "center",
    x: 0,
    y: -80,
    properties: {
      text: "Start Game",
      onClick: "level1",
      width: 200,
      height: 50,
      fontSize: "24px",
      backgroundColor: "#2E7D32",
      hoverColor: "#4CAF50",
      textColor: "#ffffff"
    }
  },
  {
    type: "button",
    id: "settings",
    anchor: "center",
    x: 0,
    y: -10,
    properties: {
      text: "Settings",
      action: "settings",
      width: 200,
      height: 50,
      fontSize: "24px",
      backgroundColor: "#2E7D32",
      hoverColor: "#4CAF50",
      textColor: "#ffffff"
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
