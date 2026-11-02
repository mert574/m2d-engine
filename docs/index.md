---
layout: home

hero:
  name: M2D Engine
  text: A 2D game engine for the browser
  tagline: Rapier physics, a WebGL2 renderer with a Canvas 2D fallback, JSON scenes and one input API for keyboard, mouse, touch and pen.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Play the examples
      link: /examples/

features:
  - title: Physics
    details: Fixed-timestep simulation on Rapier 2D. Units are pixels and seconds. Static, dynamic, kinematic and character bodies, continuous collision detection and render interpolation.
  - title: Rendering
    details: One drawing API over two backends. WebGL2 batches draw calls and adds tint, particles, lights and post effects. Canvas 2D runs where WebGL2 is unavailable.
  - title: Scenes
    details: Levels and menus are JSON with prefabs and layers. Every reference is validated on load, and a bad scene fails with the path to the field that caused it.
  - title: Input
    details: Clicks, drags, pinches, scrolls and hovers from a single Pointer Events source. Every event carries world and UI coordinates. Keys are read by physical position.
  - title: Display
    details: View size, world render resolution and UI resolution are independent. Lower the render resolution without changing what is visible or blurring the HUD.
  - title: Included
    details: Camera follow with bounds, sprite sheets, sound, anchored screen-space UI, a world overlay for sharp annotations, a debug overlay and a settings menu.
---
