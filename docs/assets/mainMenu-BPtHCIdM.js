const version = 1;
const name = "mainMenu";
const type = "ui";
const title = "Doner Rhythm - Main Menu";
const assets = {};
const elements = [
  {
    type: "rect",
    id: "background",
    x: 640,
    y: 360,
    width: 1280,
    height: 720,
    color: "#2d1b0e"
  },
  {
    type: "text",
    id: "title",
    x: 640,
    y: 120,
    properties: {
      text: "DONER RHYTHM",
      fontSize: "72px",
      align: "center",
      color: "#FFD700"
    }
  },
  {
    type: "text",
    id: "subtitle",
    x: 640,
    y: 200,
    properties: {
      text: "Build orders to the beat!",
      fontSize: "28px",
      align: "center",
      color: "#F5DEB3"
    }
  },
  {
    type: "button",
    id: "startGame",
    x: 640,
    y: 340,
    properties: {
      text: "Start Game",
      onClick: "gameplay",
      width: 250,
      height: 60,
      fontSize: "28px",
      backgroundColor: "#4a7c23",
      hoverColor: "#3d6a1a",
      textColor: "#ffffff"
    }
  },
  {
    type: "text",
    id: "instructions1",
    x: 640,
    y: 450,
    properties: {
      text: "HOW TO PLAY",
      fontSize: "24px",
      align: "center",
      color: "#CCCCCC"
    }
  },
  {
    type: "text",
    id: "instructions2",
    x: 640,
    y: 490,
    properties: {
      text: "Press X and Y in rhythm patterns to add ingredients",
      fontSize: "18px",
      align: "center",
      color: "#AAAAAA"
    }
  },
  {
    type: "text",
    id: "instructions3",
    x: 640,
    y: 520,
    properties: {
      text: "Each ingredient has a unique 3-beat pattern (0.5s per beat)",
      fontSize: "18px",
      align: "center",
      color: "#AAAAAA"
    }
  },
  {
    type: "text",
    id: "instructions4",
    x: 640,
    y: 550,
    properties: {
      text: "Match customer orders by building the right sandwich",
      fontSize: "18px",
      align: "center",
      color: "#AAAAAA"
    }
  },
  {
    type: "text",
    id: "instructions5",
    x: 640,
    y: 580,
    properties: {
      text: "Press SPACE to serve, BACKSPACE to clear",
      fontSize: "18px",
      align: "center",
      color: "#AAAAAA"
    }
  },
  {
    type: "text",
    id: "credits",
    x: 640,
    y: 680,
    properties: {
      text: "Built with M2D Engine",
      fontSize: "14px",
      align: "center",
      color: "#666666"
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
