var S=Object.defineProperty;var P=(a,i,t)=>i in a?S(a,i,{enumerable:!0,configurable:!0,writable:!0,value:t}):a[i]=t;var d=(a,i,t)=>P(a,typeof i!="symbol"?i+"":i,t);import{M as r,C as p,K as k,a as M,b as T,c as A,d as F,e as z,U as w,S as E,f as D}from"./m2d-g-8w6cCA.js";class m{constructor(i,t,e,s){d(this,"name","Entity");if(!i||!(i instanceof CanvasRenderingContext2D))throw new Error("Valid canvas context is required");if(!t)throw new Error("Physics body is required");if(!e)throw new Error("Sprite is required");if(!s)throw new Error("Game instance is required");this.context=i,this.body=t,this.sprite=e,this.game=s,this.constraints=new Map,this.currentAnim=null,this.dead=!1;const{min:o,max:n}=this.body.bounds;this.size={x:n.x-o.x,y:n.y-o.y},this._contacts=new Set}addConstraint(i,t){this.constraints.set(i,t)}getConstraint(i){return this.constraints.get(i)}onCollisionStart(i){this._contacts.add(i);for(const t of this.constraints.values())t.onCollisionStart(i)}onCollisionEnd(i){this._contacts.delete(i);for(const t of this.constraints.values())t.onCollisionEnd(i)}update(i){if(!this.dead)for(const t of this.constraints.values())t.update(i)}draw(i){if(this.dead)return;const t=this.body.position;this.context.save(),this.context.translate(t.x,t.y),this.context.rotate(this.body.angle),this.sprite.draw(this.context,0,0,this.currentAnim),this.context.restore();for(const e of this.constraints.values())e.draw(i)}get position(){return this.body.position}get velocity(){return this.body.velocity}setAnimation(i){this.sprite.animations.has(i)&&(this.currentAnim=i)}isFalling(i=.5){return this.velocity.y>i}isJumping(i=-.5){return this.velocity.y<i}isMovingHorizontally(i=.1){return Math.abs(this.velocity.x)>i}isMovingLeft(i=.1){return this.velocity.x<-i}isMovingRight(i=.1){return this.velocity.x>i}isInAir(){return!this.isOnGround()}isOnGround(){const i=this.game.engine.world,t=r.Query.collides(this.body,r.Composite.allBodies(i));for(const{bodyA:e,bodyB:s}of t){const o=e===this.body?s:e;if(!o.entity||o.entity.name!=="Platform")continue;const n=o.position.y-this.position.y;if(n>0&&Math.abs(n)<this.size.y)return!0}return!1}}class u{constructor(i){this.entity=i,this.context=i.context}update(){}onCollisionStart(i){}onCollisionEnd(i){}draw(){}}class b extends u{constructor(i,t={}){super(i),this.maxHealth=t.maxHealth||100,this.currentHealth=this.maxHealth,this.invulnerableTime=0,this.invulnerableDuration=t.invulnerableDuration||60,this.onDeath=t.onDeath||null,this.onDamage=t.onDamage||null}update(){this.invulnerableTime>0&&this.invulnerableTime--}isInvulnerable(){return this.invulnerableTime>0}takeDamage(i){this.isInvulnerable()||(this.currentHealth=Math.max(0,this.currentHealth-i),this.invulnerableTime=this.invulnerableDuration,this.onDamage&&this.onDamage(i),this.currentHealth===0&&(this.entity.dead=!0,this.onDeath&&this.onDeath()))}heal(i){this.currentHealth=Math.min(this.maxHealth,this.currentHealth+i)}draw(){if(this.entity.dead)return;const i=this.entity.position,t=this.entity.size,e=this.entity.context,s=t.x,o=4,n=i.y-t.y/2-10,h=i.x-s/2;e.fillStyle="#333",e.fillRect(h,n,s,o),e.fillStyle=this.currentHealth>30?"#2ecc71":"#e74c3c",e.fillRect(h,n,s*this.healthPercentage,o)}get healthPercentage(){return this.currentHealth/this.maxHealth}get isAlive(){return this.currentHealth>0}}const c={distance(a,i){const t=i.x-a.x,e=i.y-a.y;return Math.sqrt(t*t+e*e)},direction(a,i){return{x:i.x-a.x,y:i.y-a.y}},normalize(a){const i=Math.sqrt(a.x*a.x+a.y*a.y);return i>0?{x:a.x/i,y:a.y/i}:{x:0,y:0}},scale(a,i){return{x:a.x*i,y:a.y*i}}},g={between(a,i){return Math.atan2(i.y-a.y,i.x-a.x)},inHalfCircle(a,i){return i>0?Math.abs(a)<Math.PI/2:Math.abs(a)>Math.PI/2}};class B extends u{constructor(i,t={}){super(i),this.damage=t.damage||10,this.range=t.range||40,this.cooldown=t.cooldown||30,this.knockback=t.knockback||.02,this.isAttacking=!1,this.currentCooldown=0,this.direction=1,this.hits=new Set,this.attackDuration=10,this.attackTime=0,this.attackAnimEndTime=20,this.hitCircle=r.Bodies.circle(0,0,this.range,{isSensor:!0,isStatic:!0,collisionFilter:{category:p.enemy}}),r.Composite.add(this.entity.game.engine.world,this.hitCircle)}update(){this.currentCooldown>0&&this.currentCooldown--,r.Body.setPosition(this.hitCircle,this.entity.position),this.isAttacking&&(this.attackTime++,this.attackTime===1&&this.checkHits(),this.attackTime>=this.attackDuration&&(this.isAttacking=!1,this.attackTime=0),this.attackTime>=this.attackAnimEndTime&&this.entity.currentAnim.includes("attack")&&this.entity.setAnimation("idle"))}checkHits(){const i=r.Query.collides(this.hitCircle,r.Composite.allBodies(this.entity.game.engine.world).filter(t=>t.collisionFilter.category===p.enemy));for(const t of i){const e=t.bodyA===this.hitCircle?t.bodyB:t.bodyA;if(!e.entity||e.entity===this.entity||this.hits.has(e.entity))continue;const s={x:this.entity.position.x+this.direction*this.entity.size.x/2,y:this.entity.position.y},o=g.between(s,e.position);if(g.inHalfCircle(o,this.direction)){this.hits.add(e.entity);const n=e.entity.getConstraint("health");n&&!n.isInvulnerable()&&(n.takeDamage(this.damage),r.Body.applyForce(e,e.position,{x:this.direction*.5,y:-.3}))}}}startAttack(i){this.currentCooldown>0||(this.isAttacking=!0,this.direction=i,this.hits.clear(),this.currentCooldown=this.cooldown,this.attackTime=0,this.entity.setAnimation(i>0?"attackRight":"attackLeft"))}draw(){const i=this.entity.position,t=this.context;t.save(),t.beginPath(),t.strokeStyle="rgba(0, 150, 255, 0.3)",t.arc(i.x,i.y,this.range,0,Math.PI*2),t.stroke(),this.isAttacking&&(t.beginPath(),t.fillStyle="rgba(255, 0, 0, 0.2)",t.strokeStyle="rgba(255, 0, 0, 0.5)",t.arc(i.x,i.y,this.range,this.direction>0?-Math.PI/2:Math.PI/2,this.direction>0?Math.PI/2:3*Math.PI/2,!1),t.fill(),t.stroke()),t.restore()}}class H extends u{constructor(i,t={}){super(i),this.showWireframe=t.wireframe??!1,this.wireframeColor=t.wireframeColor||"#00ff00",this.wireframeWidth=t.wireframeWidth||1,this.showFPS=t.showFPS??!0,this.fpsUpdateInterval=500,this.lastFPSUpdate=0,this.frameCount=0,this.currentFPS=0,console.log("Debug constraint added to entity:",i)}update(i){if(this.showFPS){this.frameCount++;const t=performance.now();t-this.lastFPSUpdate>this.fpsUpdateInterval&&(this.currentFPS=Math.round(this.frameCount*1e3/(t-this.lastFPSUpdate)),this.frameCount=0,this.lastFPSUpdate=t)}}draw(i){if(this.showWireframe&&this.entity.game.renderer.drawWorld(t=>{const e=this.entity.body.bounds;t.strokeStyle=this.wireframeColor,t.lineWidth=this.wireframeWidth,t.strokeRect(e.min.x,e.min.y,e.max.x-e.min.x,e.max.y-e.min.y)}),this.showFPS){const t=this.entity.game.context;t.save(),t.setTransform(1,0,0,1,0,0),t.fillStyle="#fff",t.font="16px monospace",t.textAlign="left",t.textBaseline="top",t.fillText(`FPS: ${this.currentFPS}`,40,15),t.restore()}}setWireframe(i){this.showWireframe=i}setShowFPS(i){this.showFPS=i}}const x=Math.sqrt(2);class I extends u{constructor(i,t={}){var e,s,o,n;super(i),this.keys={left:k,right:M,up:T,down:A,jump:F,attack:z,...t.keys},this.moveForce=t.moveForce||.01,this.maxSpeed=t.maxSpeed||5,this.continuous=t.continuous??!0,this.verticalMovement=t.verticalMovement??!0,Object.values(this.keys).forEach(h=>{this.entity.game.keys.addKey(h)}),this.onMove=(e=t.onMove)==null?void 0:e.bind(i),this.onDirectionChange=(s=t.onDirectionChange)==null?void 0:s.bind(i),this.onJump=(o=t.onJump)==null?void 0:o.bind(i),this.onAttack=(n=t.onAttack)==null?void 0:n.bind(i)}update(){var s,o;if(this.entity.dead)return;const i=this.entity.game.keys.pressedKeys();let t=0,e=0;if(i.has(this.keys.left)&&(t-=1),i.has(this.keys.right)&&(t+=1),this.verticalMovement&&(i.has(this.keys.up)&&(e-=1),i.has(this.keys.down)&&(e+=1)),t!==0&&e!==0&&(t/=x,e/=x),(t!==0||e!==0)&&(this.continuous?r.Body.applyForce(this.entity.body,this.entity.position,{x:t*this.moveForce,y:e*this.moveForce}):r.Body.setVelocity(this.entity.body,{x:t*this.maxSpeed,y:e*this.maxSpeed})),this.onDirectionChange&&t!==0&&this.onDirectionChange(t>0?1:-1),this.onMove&&this.onMove(t,e),i.has(this.keys.jump)&&((s=this.onJump)==null||s.call(this)),i.has(this.keys.attack)&&((o=this.onAttack)==null||o.call(this)),this.continuous){const n=this.entity.velocity,h=Math.abs(n.x);if(h>this.maxSpeed){const y=this.maxSpeed/h;r.Body.setVelocity(this.entity.body,{x:n.x*y,y:n.y})}}}}class W extends m{constructor(t,e,s,o,n={}){super(t,e,s,o);d(this,"name","Player");r.Body.setMass(e,1),this.jumpForce=.133,this.facingDirection=1,this.setAnimation("idle"),this.groundContacts=new Set,this.addConstraint("health",new b(this,{maxHealth:100,onDeath:()=>{console.log("Game Over!"),this.game.gameOver()},onDamage:h=>{console.log(`Player took ${h} damage!`)}})),this.addConstraint("attack",new B(this,{damage:65,range:50,cooldown:60})),this.addConstraint("control",new I(this,{moveForce:.006,maxSpeed:3,continuous:!0,verticalMovement:!1,onMove:(h,y)=>{h!==0?this.setAnimation("run"):this.setAnimation("idle")},onDirectionChange:h=>{this.facingDirection=h},onJump:()=>{this.isOnGround()&&(r.Body.applyForce(this.body,this.position,{x:0,y:-this.jumpForce}),this.setAnimation("jump"))},onAttack:()=>{const h=this.getConstraint("attack");h&&h.startAttack(this.facingDirection)}})),this.addConstraint("debug",new H(this))}onCollisionStart(t){var e,s,o;if(super.onCollisionStart(t),t.position.y>this.position.y+this.size.y/2&&(((e=t.entity)==null?void 0:e.name)==="Platform"||((s=t.entity)==null?void 0:s.name)==="MovingPlatform")&&this.groundContacts.add(t.id),((o=t.entity)==null?void 0:o.name)==="Bee"){const n=this.getConstraint("health");n&&n.takeDamage(33)}}onCollisionEnd(t){super.onCollisionEnd(t),this.groundContacts.delete(t.id)}isOnGround(){return this.groundContacts.size>0}}class R extends m{constructor(t,e,s,o){r.Body.setMass(e,1),e.frictionAir=.2,e.friction=.1,e.restitution=.2,e.inertia=1/0,e.collisionFilter.category=p.enemy;super(t,e,s,o);d(this,"name","Bee");this.speed=.5,this.idleSpeed=.3,this.detectionRange=400,this.animTime=0,this.animSpeed=.1,this.setAnimation("idle"),this.damageFlashTime=0,this.damageFlashDuration=10;const n=new b(this,40);n.invulnerableDuration=30,n.onDeath=()=>{this.game.entities.delete(this),r.Composite.remove(this.game.engine.world,this.body)},n.onDamage=()=>{this.damageFlashTime=this.damageFlashDuration,this.setAnimation("idle")},this.addConstraint("health",n),this.targetPoint=this.getNewTargetPoint(),this.targetChangeTime=0,this.targetChangeCooldown=120}getNewTargetPoint(){return{x:this.position.x+(Math.random()*50*2-50),y:this.position.y+(Math.random()*50*2-50)}}update(){if(this.dead||(super.update(),this.damageFlashTime>0&&this.damageFlashTime--,!this.game.player))return;if(c.distance(this.position,this.game.player.position)<this.detectionRange){const e=c.direction(this.position,this.game.player.position),s=c.scale(c.normalize(e),this.speed);r.Body.setVelocity(this.body,s)}else if(this.targetChangeTime++,this.targetChangeTime>=this.targetChangeCooldown&&(this.targetPoint=this.getNewTargetPoint(),this.targetChangeTime=0),c.distance(this.position,this.targetPoint)>1){const s=c.direction(this.position,this.targetPoint),o=c.scale(c.normalize(s),this.idleSpeed);r.Body.setVelocity(this.body,o)}this.animTime+=this.animSpeed,this.animTime>=3&&(this.animTime=0),this.sprite.currentFrame=Math.floor(this.animTime)}draw(t){if(!this.dead&&(super.draw(t),this.damageFlashTime>0)){const e=this.position,s=this.context;s.save(),s.globalAlpha=this.damageFlashTime/this.damageFlashDuration,s.fillStyle="rgba(255, 0, 0, 0.5)",s.fillRect(e.x-this.size.x/2,e.y-this.size.y/2,this.size.x,this.size.y),s.restore()}}}class K extends m{constructor(t,e,s,o){var n;e.isStatic=!0,e.friction=.65,e.frictionStatic=.1,e.restitution=0;super(t,e,s,o);d(this,"name","Platform");this.visible=!!((n=e.render)!=null&&n.visible)}draw(t){if(!this.visible)return;const e=this.body.position;this.sprite.drawStatic(this.context,e.x,e.y,0,0)}}class O extends m{constructor(t,e,s,o,n={}){e.isStatic=!0,e.friction=1,e.frictionStatic=1,e.restitution=0;super(t,e,s,o);d(this,"name","MovingPlatform");this.points=n.points||[],this.speed=n.speed||3,this.waitTime=n.waitTime||1e3,this.currentPoint=0,this.waiting=!1,this.waitStart=0,this.lastPosition={...this.points[0]},this.ridingEntities=new Set,this.points.length>0&&r.Body.setPosition(this.body,this.points[0])}onCollisionStart(t){super.onCollisionStart(t),t.position.y<this.position.y&&Math.abs(t.position.x-this.position.x)<this.size.x/2+t.bounds.max.x-t.bounds.min.x/2&&this.ridingEntities.add(t)}onCollisionEnd(t){super.onCollisionEnd(t),this.ridingEntities.delete(t)}update(t){if(this.points.length<2)return;if(this.waiting){Date.now()-this.waitStart>=this.waitTime&&(this.waiting=!1,this.currentPoint=(this.currentPoint+1)%this.points.length);return}const e=this.points[this.currentPoint],s=e.x-this.body.position.x,o=e.y-this.body.position.y,n=Math.sqrt(s*s+o*o);if(n<1){this.waiting=!0,this.waitStart=Date.now(),r.Body.setPosition(this.body,e);return}const h=Math.min(this.speed*t,n),y=s/n*h,C=o/n*h;this.lastPosition={x:this.body.position.x,y:this.body.position.y},r.Body.setPosition(this.body,{x:this.body.position.x+y,y:this.body.position.y+C});const v={x:this.body.position.x-this.lastPosition.x,y:this.body.position.y-this.lastPosition.y};for(const f of this.ridingEntities)f.entity&&r.Body.translate(f,v)}}class Y extends m{constructor(i,t,e,s){super(i,t,e,s),t.isSensor=!0,this.floatOffset=0,this.floatSpeed=2,this.floatAmount=5,this.baseY=t.position.y,this.rotation=0,this.rotationSpeed=2}update(i){this.floatOffset+=this.floatSpeed*i;const t=this.baseY+Math.sin(this.floatOffset)*this.floatAmount;this.rotation+=this.rotationSpeed*i,r.Body.setPosition(this.body,{x:this.body.position.x,y:t}),r.Body.setAngle(this.body,this.rotation)}onCollisionStart(i){i.entity&&i.entity===this.game.player&&(this.game.entities.delete(this),r.World.remove(this.game.engine.world,this.body))}}class _ extends m{constructor(t,e,s,o,n={}){super(t,e,s,o);d(this,"name","Trigger");e.isSensor=!0,e.isStatic=!0,this.category=n.category||"trigger",this.visible=n.visible||!1,this.data=n.data||{},this.onEnter=n.onEnter||null,this.onExit=n.onExit||null,this.active=!0,this.debugColor=n.debugColor||"#e7693166"}onCollisionStart(t){var e;super.onCollisionStart(t),console.log("onCollisionStart",t.entity.name),this.active&&((e=t.entity)==null?void 0:e.name)==="Player"&&this.onEnter&&this.onEnter(t.entity,this.data)}onCollisionEnd(t){var e;super.onCollisionEnd(t),this.active&&((e=t.entity)==null?void 0:e.name)==="Player"&&this.onExit&&this.onExit(t.entity,this.data)}draw(t){if(!this.visible)return;const e=this.body.bounds,s=e.max.x-e.min.x,o=e.max.y-e.min.y;this.context.save(),this.context.fillStyle=this.debugColor,this.context.fillRect(this.body.position.x-s/2,this.body.position.y-o/2,s,o),this.context.fillStyle="#ffffffaa",this.context.font="14px system-ui",this.context.textAlign="center",this.context.fillText(this.category,this.body.position.x,this.body.position.y+3.5),this.context.restore()}setActive(t){this.active=t}setVisible(t){this.visible=t}}class U extends w{constructor(i,t,e,s,o,n){super(i,t,e,s),this.text=o,this.onClick=n,this.backgroundColor="#333",this.hoverColor="#555",this.textColor="#fff",this.fontSize="32px",this.fontFamily="system-ui"}draw(i){this.visible&&(i.fillStyle=this.isHovered?this.hoverColor:this.backgroundColor,i.fillRect(this.x,this.y,this.width,this.height),i.fillStyle=this.textColor,i.font=`${this.fontSize} ${this.fontFamily}`,i.textAlign="center",i.textBaseline="middle",i.fillText(this.text,this.x+this.width/2,this.y+this.height/2))}onMouseEnter(){document.body.style.cursor="pointer"}onMouseLeave(){document.body.style.cursor="default"}destroy(){this.isHovered&&(document.body.style.cursor="default")}}class q extends w{constructor(i,t,e,s={}){super(i,t,0,0),this.text=e,this.color=s.color||"#fff",this.fontSize=s.fontSize||"16px",this.fontFamily=s.fontFamily||"system-ui",this.align=s.align||"left",this.baseline=s.baseline||"top"}draw(i){if(this.visible){if(i.fillStyle=this.color,i.font=`${this.fontSize} ${this.fontFamily}`,i.textAlign=this.align,i.textBaseline=this.baseline,this.width===0||this.height===0){const t=i.measureText(this.text);this.width=t.width,this.height=parseInt(this.fontSize)}i.fillText(this.text,this.x,this.y)}}setText(i){this.text=i,this.width=0,this.height=0}}class G extends E{constructor(i,t){super(i,{...t,backgroundColor:"#2c3e50"})}async _loadNormalScene(){const i=this.game.canvas.width/2,t=new q(i,100,"Platformer Demo",{fontSize:"48px",align:"center",color:"#ecf0f1"}),e=200,s=50,o=new U(i-e/2,200,e,s,"Start Game",()=>{this.game.sceneManager.switchTo("game")});o.backgroundColor="#3498db",o.hoverColor="#2980b9",o.textColor="#ffffff",o.fontSize="20px",this.ui.add(t),this.ui.add(o)}}const j={name:"game",type:"level",title:"Simple Platformer",gameType:"sideScroll",sprites:[["assets/platform.png",32],["assets/player.png",32],["assets/enemy.png",32],["assets/coin.png",32],["assets/movingPlatform.png",32]],player:{type:"player",position:[100,1300],size:[32,32],sprite:1,animations:[["idle",0,0,!0],["run",1,0],["jump",2,0]],options:{friction:5,frictionStatic:5,frictionAir:.001}},entities:[{type:"platform",position:[200,1400],size:[400,32],sprite:0,options:{friction:1,frictionStatic:1}},{type:"movingPlatform",position:[400,1200],size:[192,32],sprite:4,animations:[["default",0,0,!0]],options:{points:[{x:400,y:1200},{x:800,y:1200}],speed:300,waitTime:1e3}},{type:"movingPlatform",position:[1200,1e3],size:[192,32],sprite:4,animations:[["default",0,0,!0]],options:{points:[{x:1200,y:1e3},{x:1200,y:700}],speed:300,waitTime:1e3}},{type:"platform",position:[600,1e3],size:[192,32],sprite:0},{type:"platform",position:[900,800],size:[192,32],sprite:0},{type:"platform",position:[1500,600],size:[192,32],sprite:0},{type:"platform",position:[1700,400],size:[256,32],sprite:0},{type:"platform",position:[1400,300],size:[192,32],sprite:0},{type:"coin",position:[600,800],size:[24,24],sprite:3},{type:"coin",position:[900,700],size:[24,24],sprite:3},{type:"coin",position:[1200,600],size:[24,24],sprite:3},{type:"coin",position:[1500,500],size:[24,24],sprite:3},{type:"bee",position:[700,850],size:[32,32],sprite:2,animations:[["idle",0,0,!0],["left",1,0],["right",2,0]]},{type:"bee",position:[1300,750],size:[32,32],sprite:2,animations:[["idle",0,0,!0],["left",1,0],["right",2,0]]},{type:"platform",position:[16,720],size:[32,1440],sprite:0},{type:"platform",position:[1904,720],size:[32,1440],sprite:0},{type:"trigger",position:[1400,268],size:[192,32],sprite:0,options:{category:"levelComplete",visible:!0,onEnter:(a,i)=>{console.log("Level Complete!"),a.game.sceneManager.switchTo("mainMenu")}}}]},V=document.getElementById("screen"),l=new D(V,{initialScene:"mainMenu",width:1280,height:960,worldWidth:1920,worldHeight:1440});l.registerActor("player",W);l.registerActor("bee",R);l.registerActor("platform",K);l.registerActor("movingPlatform",O);l.registerActor("coin",Y);l.registerActor("trigger",_);l.sceneManager.scenes.set("mainMenu",new G(l,{name:"mainMenu",type:"menu",gameType:"menu",sprites:[]}));l.sceneManager.setLevelData("game",j);l.start();
