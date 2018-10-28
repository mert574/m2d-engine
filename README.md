# m2d-engine

A small engine that will be used later for my game.

## Demo
[Check out the demo](https://mert574.github.io/m2d-engine/)

### Controls

|Key        | Action             |
|----------:|:------------------:|
|Arrow Keys | Movement           |
|Space      | Jump               |
|n          | Switch levels      |
|v          | Toggle boundaries  |


### Level JSON Data Type
```json
{
    "title": "String",
    "gameType": "String ('sideScroll'/'topDown')",
    "sprites": "Array of strings",
    "player": ["x", "y", "w", "h", "spriteIndex", [ ["animName", "tileX", "tileY"] ] ],
    "entities": [ ["x", "y", "w", "h", "spriteIndex", [ ["animName", "tileX", "tileY"] ], "options" ] ]
}
```