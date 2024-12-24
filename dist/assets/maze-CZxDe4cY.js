import{a as r}from"./m2d-DXT2tj7Y.js";const d={levelNames:["maze.json"],currentLevel:"maze.json",levelsPath:"./levels/"},a=38,y=40,o=37,i=39,c=document.getElementById("screen"),e=new r(c,d),t={MOVE_FORCE:.01,FRICTION_FACTOR:.95};e.keys.addKey(a);e.keys.addKey(y);e.keys.addKey(o);e.keys.addKey(i);const p={title:"Maze Game",gameType:"topDown",sprites:[["./assets/player.png",32],["./assets/wall.png",32],["./assets/floor.png",32]],background:[2,0,0],player:[50,50,32,32,0,[["default",0,0]],{frictionAir:.2,friction:.1,density:.001}],entities:[[320,16,640,32,1,[["default",0,0]],{isStatic:!0}],[320,464,640,32,1,[["default",0,0]],{isStatic:!0}],[16,240,32,480,1,[["default",0,0]],{isStatic:!0}],[624,240,32,480,1,[["default",0,0]],{isStatic:!0}],[200,150,32,200,1,[["default",0,0]],{isStatic:!0}],[400,300,32,200,1,[["default",0,0]],{isStatic:!0}],[300,200,200,32,1,[["default",0,0]],{isStatic:!0}],[100,350,200,32,1,[["default",0,0]],{isStatic:!0}]]};e.levelManager.loadLevel=async()=>p;e.beforeUpdate=function(){const s=this.player.body.position;for(let l of this.keys.pressedKeys())switch(l){case o:e.Body.applyForce(this.player.body,s,{x:-t.MOVE_FORCE,y:0});break;case i:e.Body.applyForce(this.player.body,s,{x:t.MOVE_FORCE,y:0});break;case a:e.Body.applyForce(this.player.body,s,{x:0,y:-t.MOVE_FORCE});break;case y:e.Body.applyForce(this.player.body,s,{x:0,y:t.MOVE_FORCE});break}this.keys.pressedKeys().size||e.Body.setVelocity(this.player.body,{x:this.player.body.velocity.x*t.FRICTION_FACTOR,y:this.player.body.velocity.y*t.FRICTION_FACTOR})};e.start();
