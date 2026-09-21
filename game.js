/* PIXEL ALCHEMIST - original browser prototype inspired by falling-sand roguelites.
   No external assets, server, or build step required. */
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:false});
const VW=320,VH=180,W=320,H=1680;
const MAT={AIR:0,ROCK:1,DIRT:2,SAND:3,WATER:4,OIL:5,LAVA:6,WOOD:7,ICE:8,MOSS:9,BLOOD:10,STEAM:11,FIRE:12,SMOKE:13,GOLD:14,SNOW:15,TOXIC:16,STONE:17,METAL:18,HOLY:19};
const MAT_NAME=['air','rock','dirt','sand','water','oil','lava','wood','ice','moss','blood','steam','fire','smoke','gold','snow','toxic','stone','metal','holy'];
const MAT_COL=['#05060b','#424553','#59433d','#9a7545','#4d91c3','#8b673f','#e25c2f','#765141','#a9c8d1','#496c4b','#ad3f50','#c5dae1','#f4a23b','#8c8c9b','#e2b94c','#d4e4ef','#9bba45','#6c6c75','#6f747f','#746b85'];
const SOLID=new Set([MAT.ROCK,MAT.DIRT,MAT.SAND,MAT.WOOD,MAT.ICE,MAT.MOSS,MAT.GOLD,MAT.STONE,MAT.METAL,MAT.HOLY]);
const LIQ=new Set([MAT.WATER,MAT.OIL,MAT.LAVA,MAT.BLOOD,MAT.TOXIC]);
const BIOMES=[
  {name:'MINES',bg:'#11172a',rock:'#444650',accent:'#bc8755'},
  {name:'COAL PITS',bg:'#151426',rock:'#36364a',accent:'#a66a48'},
  {name:'SNOWY DEPTHS',bg:'#15223a',rock:'#596f7e',accent:'#b9dfef'},
  {name:'HIISI BASE',bg:'#181d24',rock:'#48515b',accent:'#de9d54'},
  {name:'UNDERGROUND JUNGLE',bg:'#0d211c',rock:'#315342',accent:'#58ae62'},
  {name:'THE VAULT',bg:'#211a22',rock:'#574451',accent:'#d07b64'},
  {name:'TEMPLE OF ART',bg:'#1c1829',rock:'#695b76',accent:'#d6b6e2'},
  {name:'THE LABORATORY',bg:'#21151a',rock:'#73614c',accent:'#f0c56c'}
];
let seed=0,rng=()=>0,world,player,enemies=[],projectiles=[],particles=[],pickups=[],wands=[],currentWand=0,perkChoices=[],holySeen=new Set(),gameState='title',cameraY=0,frame=0,logTimer=0,runGold=0,runDepth=0,editMode=false,hoverHeld=false;
const keys={};let pointer={x:160,y:90,down:false,active:false};
const $=id=>document.getElementById(id);
function makeRng(s){let t=s>>>0;return()=>{t+=0x6D2B79F5;let x=t;x=Math.imul(x^x>>>15,1|x);x^=x+Math.imul(x^x>>>7,61|x);return((x^x>>>14)>>>0)/4294967296}}
function rint(a,b){return Math.floor(rng()*(b-a+1))+a} function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function idx(x,y){return y*W+x} function inside(x,y){return x>=0&&x<W&&y>=0&&y<H}
function get(x,y){return inside(x,y)?world.cells[idx(x|0,y|0)]:MAT.ROCK} function setm(x,y,m){if(inside(x,y))world.cells[idx(x|0,y|0)]=m}
function biomeAt(y){let n=clamp(Math.floor(y/190),0,7);return BIOMES[n]}
function inHoly(y){return world.holy.some(h=>y>=h.y0&&y<h.y1)}

function generateWorld(){
  world={w:W,h:H,cells:new Uint8Array(W*H),holy:[],rooms:[],visited:new Uint8Array(H)};
  world.cells.fill(MAT.AIR);
  for(let y=0;y<H;y++){
    const b=biomeAt(y), band=Math.floor(y/190), holy=(y>155&&y%190<44);
    if(holy){ for(let x=0;x<W;x++)setm(x,y,MAT.ROCK); }
    for(let x=0;x<W;x++){
      if(y<28){continue}
      const edge=x<8||x>W-9;
      const cavern=Math.sin(x*.105+y*.035)+Math.sin(x*.022-y*.08)+Math.sin((x+y)*.014);
      let solid=edge||cavern<-0.35||(y>H-18);
      if(holy)solid=true;
      if(holy && x>42&&x<278&&y%190>8&&y%190<38)solid=false;
      if(!holy && y%190>48 && cavern>0.2)solid=false;
      if(solid){
        let mat=MAT.ROCK;
        if(band===0)mat=rng()<.38?MAT.DIRT:MAT.ROCK;
        else if(band===1)mat=rng()<.5?MAT.ROCK:MAT.DIRT;
        else if(band===2)mat=rng()<.45?MAT.SNOW:MAT.ICE;
        else if(band===3)mat=rng()<.55?MAT.METAL:MAT.ROCK;
        else if(band===4)mat=rng()<.5?MAT.MOSS:MAT.DIRT;
        else if(band===5)mat=rng()<.42?MAT.METAL:MAT.ROCK;
        else if(band===6)mat=rng()<.36?MAT.STONE:MAT.ROCK;
        else mat=rng()<.4?MAT.METAL:MAT.STONE;
        setm(x,y,mat);
      }
      if(!holy && !solid && rng()<.018){setm(x,y,band===2?MAT.WATER:(band===5?MAT.OIL:MAT.SAND))}
    }
    if(y%190===156){world.holy.push({y0:y,y1:y+44,claimed:false});}
  }
  // guaranteed vertical shafts and holy mountain rooms
  for(let y=28;y<H-18;y++){ if(y%190>48&&rng()<.86){for(let x=145+rint(-18,18);x<175+rint(-18,18);x++)setm(x,y,MAT.AIR)} }
  for(const h of world.holy){for(let y=h.y0+7;y<h.y1-2;y++)for(let x=38;x<282;x++)setm(x,y,MAT.AIR);for(let x=45;x<275;x++){setm(x,h.y0+3,MAT.HOLY);setm(x,h.y1-1,MAT.HOLY)}for(let y=h.y0+3;y<h.y1;y++){setm(43,y,MAT.HOLY);setm(277,y,MAT.HOLY)} }
  // starting clearing
  for(let y=16;y<58;y++)for(let x=132;x<188;x++)setm(x,y,MAT.AIR);
  enemies=[];projectiles=[];particles=[];pickups=[];holySeen=new Set();runGold=0;runDepth=0;
  player={x:160,y:42,vx:0,vy:0,w:6,h:10,hp:100,maxHp:100,mana:120,maxMana:120,hover:100,maxHover:100,inv:0,onGround:false,dir:1,wet:0,burning:0,poison:0,dead:false,perk:{},kills:0};
  for(let band=0;band<8;band++){let y0=band*190+72,y1=Math.min(H-40,y0+105);for(let i=0;i<6+band*2;i++){let x=rint(24,296),y=rint(y0,y1);if(get(x,y)===MAT.AIR)spawnEnemy(rng()<.22?'shooter':(rng()<.2?'bat':'walker'),x,y)}for(let i=0;i<4;i++){let x=rint(30,290),y=rint(y0,y1);if(get(x,y)===MAT.AIR)pickups.push({type:rng()<.6?'gold':'spell',x,y,vx:0,vy:0,val:rint(5,18),spell:randomSpell()})}}
  spawnEnemy('boss',160,H-70);
}
function randomSpell(){return ['spark','bolt','fireball','bomb','drill','water','scatter','lightning','teleport'][rint(0,8)]}
function spawnEnemy(type,x,y){let e={type,x,y,vx:0,vy:0,hp:type==='boss'?620:(type==='shooter'?42:type==='bat'?18:28),max:type==='boss'?620:(type==='shooter'?42:type==='bat'?18:28),cool:rint(30,100),dir:rng()<.5?-1:1,phase:rng()*9,dead:false};if(get(x,y)!==MAT.AIR){for(let yy=y;yy>0&&get(x,yy)!==MAT.AIR;yy--)if(get(x,yy-1)===MAT.AIR){e.y=yy-1;break}}enemies.push(e)}

const SPELLS={
  spark:{name:'火花弹',cost:4,delay:8,color:'#ffe780',kind:'bolt',dmg:10,speed:3.7},bolt:{name:'魔法箭',cost:8,delay:16,color:'#82d5ff',kind:'bolt',dmg:21,speed:4.2},fireball:{name:'炎爆',cost:18,delay:28,color:'#ff9345',kind:'explosive',dmg:30,speed:2.8,rad:10},bomb:{name:'不稳定炸弹',cost:28,delay:36,color:'#f4d15f',kind:'explosive',dmg:60,speed:2.1,rad:16},drill:{name:'光明钻头',cost:9,delay:3,color:'#e9f4ff',kind:'drill',dmg:8,speed:4.8},water:{name:'水流',cost:2,delay:2,color:'#6fc4ff',kind:'water',dmg:2,speed:4.4},scatter:{name:'散射弹',cost:13,delay:24,color:'#d3a7ff',kind:'multi',dmg:12,speed:3.2},lightning:{name:'链式闪电',cost:22,delay:35,color:'#b9e7ff',kind:'chain',dmg:42,speed:5},teleport:{name:'短距传送',cost:20,delay:45,color:'#b28dff',kind:'teleport',dmg:0,speed:0}
};
const MODS={triple:{name:'三重施法',cost:10,color:'#ffcf6b'},homing:{name:'追踪',cost:5,color:'#dc8cff'},fire:{name:'火焰轨迹',cost:3,color:'#ff8149'},bouncy:{name:'弹射',cost:3,color:'#83e9b2'},critical:{name:'暴击',cost:4,color:'#fff0a4'},explosive:{name:'爆炸修饰',cost:7,color:'#ff9a55'},mana:{name:'节能',cost:-2,color:'#8de6ff'}};
function baseWand(name,slots){return {name,slots,castDelay:10+slots.length*2,recharge:30,mana:130,manaMax:130,regen:20,shuffle:false,timer:0,shot:0}}
function setupWands(){wands=[baseWand('晨星',[{id:'spark'},{id:'spark'},{id:'fire'}]),baseWand('水银',[{id:'bolt'},{id:'homing'},{id:'mana'}]),baseWand('矿井',[{id:'bomb'},{id:'explosive'}]),baseWand('裂隙',[{id:'drill'},{id:'bouncy'},{id:'critical'}])];wands.forEach((w,i)=>{w.slots=w.slots.map(s=>SPELLS[s.id]?{id:s.id}:MODS[s.id]?{id:s.id}:s);wands[i].manaMax=140+i*25;wands[i].mana=wands[i].manaMax})}
function spellName(id){return SPELLS[id]?.name||MODS[id]?.name||id}

function solidAtRect(x,y,w,h){const l=Math.floor(x-w/2),r=Math.floor(x+w/2),t=Math.floor(y-h/2),b=Math.floor(y+h/2);for(let yy=t;yy<=b;yy++)for(let xx=l;xx<=r;xx++)if(SOLID.has(get(xx,yy)))return true;return false}
function moveBody(o,dx,dy,w,h){let moved=false;if(dx){let nx=o.x+dx;if(!solidAtRect(nx,o.y,w,h)){o.x=nx;moved=true}else{o.vx=0}}if(dy){let ny=o.y+dy;if(!solidAtRect(o.x,ny,w,h)){o.y=ny;moved=true}else{o.vy=0}}return moved}
function aim(){let ax=pointer.active?pointer.x-player.x:pointer.x;let ay=pointer.active?(pointer.y+cameraY-player.y):0;if(Math.abs(ax)<.1&&Math.abs(ay)<.1)ax=player.dir*10;return {x:ax,y:ay}}
function cast(){if(gameState!=='play'||editMode||perkChoices.length)return;let w=wands[currentWand];if(w.timer>0)return;let a=aim(),len=Math.hypot(a.x,a.y)||1,dx=a.x/len,dy=a.y/len;let base=w.slots.find(s=>SPELLS[s.id]);if(!base)return;let s=SPELLS[base.id],mods=w.slots.filter(x=>!SPELLS[x.id]).map(x=>x.id);let cost=Math.max(1,s.cost+mods.reduce((n,m)=>n+(MODS[m]?.cost||0),0));if(w.mana<cost){toast('魔力不足');return}w.mana-=cost;w.timer=(w.castDelay+s.delay)*.6;let count=s.kind==='multi'?3:1;if(mods.includes('triple'))count+=2;for(let i=0;i<count;i++){let spread=(i-(count-1)/2)*.13;let c=Math.cos(spread),q=Math.sin(spread),vx=(dx*c-dy*q)*s.speed,vy=(dx*q+dy*c)*s.speed;let p={x:player.x+dx*7,y:player.y+dy*7,vx,vy,life:160,type:s.kind,dmg:s.dmg*(player.perk.power?2:1),color:s.color,rad:(s.rad||2)*(player.perk.power?1.35:1),bouncy:mods.includes('bouncy'),homing:mods.includes('homing'),fire:mods.includes('fire')||s.kind==='explosive',explosive:mods.includes('explosive')||s.kind==='explosive',chain: s.kind==='chain',water:s.kind==='water',teleport:s.kind==='teleport',drill:s.kind==='drill',owner:'player'};projectiles.push(p)}
  if(s.kind==='teleport'){player.x=clamp(player.x+dx*64,8,W-8);player.y=clamp(player.y+dy*64,12,H-20);toast('短距传送')}
  sound(s.kind==='explosive'?'boom':'cast');
}
function impact(p,x,y){if(p.teleport)return;if(p.explosive)explode(x,y,p.rad||10,p.dmg);else if(p.drill){for(let q=-3;q<=3;q++)for(let k=-3;k<=3;k++)if(q*q+k*k<13&&SOLID.has(get(x+q,y+k)))setm(x+q,y+k,MAT.AIR)}else if(p.water){for(let i=0;i<3;i++)if(get(x+rint(-1,1),y+rint(-1,1))!==MAT.HOLY)setm(x+rint(-1,1),y+rint(-1,1),MAT.WATER)}else if(p.fire){setm(x,y,MAT.FIRE);for(let i=0;i<3;i++)if(inside(x+rint(-2,2),y+rint(-2,2)))setm(x+rint(-2,2),y+rint(-2,2),MAT.FIRE)}
}
function explode(x,y,rad,dmg){for(let yy=-rad;yy<=rad;yy++)for(let xx=-rad;xx<=rad;xx++){let d=Math.hypot(xx,yy);if(d<=rad){let gx=x+xx,gy=y+yy;if(inside(gx,gy)&&get(gx,gy)!==MAT.HOLY){if(SOLID.has(get(gx,gy))||LIQ.has(get(gx,gy)))setm(gx,gy,d<rad*.5?MAT.AIR:(rng()<.3?MAT.FIRE:MAT.AIR));}}}particles.push({x,y,life:12,max:12,kind:'boom',rad});for(const e of enemies)if(!e.dead&&Math.hypot(e.x-x,e.y-y)<rad+7)damageEnemy(e,dmg*(1-Math.hypot(e.x-x,e.y-y)/(rad+7)));if(Math.hypot(player.x-x,player.y-y)<rad+6)hurt(8,'爆炸波及')}
function damageEnemy(e,d){e.hp-=d;if(e.hp<=0)killEnemy(e)}
function killEnemy(e){if(e.dead)return;e.dead=true;player.kills++;let n=e.type==='boss'?160:rint(3,16);pickups.push({type:'gold',x:e.x,y:e.y,vx:rng()-.5,vy:-1.5,val:n});if(e.type!=='boss')for(let i=0;i<4;i++)particles.push({x:e.x+rint(-3,3),y:e.y+rint(-3,3),life:rint(12,28),max:28,kind:'blood'});else{for(let i=0;i<18;i++)particles.push({x:e.x,y:e.y,life:60,max:60,kind:'boom',rad:18});gameState='win';$('win').classList.remove('hide');sound('win')}}
function hurt(d,reason){if(player.inv>0||player.dead)return;let reduce=player.perk.resist?0.5:1;player.hp-=d*reduce;player.inv=35;toast(reason||'受到伤害');if(player.hp<=0){player.dead=true;gameState='dead';$('deadReason').textContent=reason||'你的身体无法继续承受混沌。';$('runStats').textContent=`深入 ${Math.floor(player.y)}m · 击败 ${player.kills} 个生物 · 携带 ${runGold} gold`;$('dead').classList.remove('hide');sound('dead')}}

function updateMaterials(){
  const y0=clamp(Math.floor(cameraY)-12,0,H-1),y1=clamp(y0+VH+24,1,H-2);
  for(let y=y1;y>=y0;y--){let start=(frame*7+y*13)%W;for(let k=0;k<W;k++){let x=(start+k)%W,m=get(x,y);if(m===MAT.SAND||m===MAT.SNOW){if(get(x,y+1)===MAT.AIR){setm(x,y,MAT.AIR);setm(x,y+1,m)}else{let d=rng()<.5?-1:1;if(get(x+d,y+1)===MAT.AIR){setm(x,y,MAT.AIR);setm(x+d,y+1,m)}}}else if(LIQ.has(m)){if(m===MAT.LAVA&&get(x,y+1)===MAT.WATER){setm(x,y,MAT.STONE);setm(x,y+1,MAT.STEAM)}else if(get(x,y+1)===MAT.AIR){setm(x,y,MAT.AIR);setm(x,y+1,m)}else{let d=rng()<.5?-1:1;if(get(x+d,y)===MAT.AIR){setm(x,y,MAT.AIR);setm(x+d,y,m)}}}else if(m===MAT.STEAM||m===MAT.SMOKE){if(get(x,y-1)===MAT.AIR){setm(x,y,MAT.AIR);setm(x,y-1,m)}else if(rng()<.03)setm(x,y,m===MAT.STEAM?MAT.WATER:MAT.AIR)}else if(m===MAT.FIRE){if(rng()<.08)setm(x,y,MAT.SMOKE);for(let q=-1;q<=1;q++)for(let p=-1;p<=1;p++)if(get(x+q,y+p)===MAT.WOOD&&rng()<.08)setm(x+q,y+p,MAT.FIRE)}else if(m===MAT.WATER){}}
  }
}
function updateProjectiles(){for(let i=projectiles.length-1;i>=0;i--){let p=projectiles[i];if(p.homing){let near=enemies.filter(e=>!e.dead).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(near&&Math.hypot(near.x-p.x,near.y-p.y)<100){let d=Math.hypot(near.x-p.x,near.y-p.y)||1;p.vx+=(near.x-p.x)/d*.08;p.vy+=(near.y-p.y)/d*.08;let n=Math.hypot(p.vx,p.vy)||1;p.vx=p.vx/n*3.8;p.vy=p.vy/n*3.8}}p.x+=p.vx;p.y+=p.vy;p.vy+=p.type==='bolt'?.012:.035;p.life--;let hit=SOLID.has(get(p.x,p.y));if(hit){if(p.bouncy&&p.life>20){p.vx*=-.8;p.vy*=-.8;p.life-=20}else{impact(p,Math.floor(p.x),Math.floor(p.y));projectiles.splice(i,1);continue}}if(p.owner==='enemy'&&Math.hypot(player.x-p.x,player.y-p.y)<6){hurt(p.dmg,'被远程法术击中');projectiles.splice(i,1);continue}for(const e of enemies){if(e.dead||p.owner==='enemy')continue;if(Math.hypot(e.x-p.x,e.y-p.y)<(e.type==='boss'?10:6)){let mult=player.perk.crit&&rng()<.2?2:1;damageEnemy(e,p.dmg*mult);if(p.chain){for(const other of enemies)if(other!==e&&!other.dead&&Math.hypot(other.x-e.x,other.y-e.y)<34)damageEnemy(other,p.dmg*.5)}projectiles.splice(i,1);break}}if(p.life<=0||p.x<1||p.x>W-1||p.y<1||p.y>H-1)projectiles.splice(i,1)} }
function updateEnemies(){for(let i=enemies.length-1;i>=0;i--){let e=enemies[i];if(e.dead){enemies.splice(i,1);continue}e.cool--;let dx=player.x-e.x,dy=player.y-e.y,dist=Math.hypot(dx,dy)||1;if(e.type==='walker'){e.vx+=Math.sign(dx)*.018;e.vx*=.9;e.vx=clamp(e.vx,-.5,.5);e.vy+=.13;if(Math.abs(dx)<60&&e.cool<=0&&Math.abs(dy)<20){e.vy=-2;e.cool=80}moveBody(e,e.vx,e.vy,7,10);if(dist<8)hurt(6,'被幽影撕咬')}else if(e.type==='shooter'){e.vx+=(Math.sin(frame*.03+e.phase)*.02);e.vy+=(Math.cos(frame*.025+e.phase)*.02);e.vx*=.98;e.vy*=.98;moveBody(e,e.vx,e.vy,7,8);if(e.cool<=0&&dist<150){let a=Math.atan2(dy,dx);projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*2,vy:Math.sin(a)*2,life:120,type:'enemy',dmg:10,color:'#ee7094',rad:2,owner:'enemy'});e.cool=90}}else if(e.type==='bat'){e.x+=Math.sin(frame*.08+e.phase)*.35;e.y+=Math.cos(frame*.07+e.phase)*.3;if(dist<8)hurt(5,'被蝙蝠撞击')}else if(e.type==='boss'){e.vx+=(Math.sin(frame*.02)*.015+Math.sign(dx)*.01);e.vy+=(Math.cos(frame*.018)*.015+Math.sign(dy)*.01);e.vx=clamp(e.vx,-.75,.75);e.vy=clamp(e.vy,-.5,.5);e.x=clamp(e.x+e.vx,18,W-18);e.y=clamp(e.y+e.vy,8,H-18);if(e.cool<=0&&dist<230){let a=Math.atan2(dy,dx);for(let q=-1;q<=1;q++){let aa=a+q*.16;projectiles.push({x:e.x,y:e.y,vx:Math.cos(aa)*1.8,vy:Math.sin(aa)*1.8,life:180,type:'enemy',dmg:15,color:'#d978e8',rad:3,owner:'enemy'})}e.cool=55}if(dist<13)hurt(15,'终焉之眼灼烧')}}}
function updatePickups(){for(let i=pickups.length-1;i>=0;i--){let p=pickups[i];p.vy+=.06;p.x+=p.vx;p.y+=p.vy;if(SOLID.has(get(p.x,p.y))){p.vx*=.8;p.vy*=-.25;p.y-=.3}if(Math.hypot(p.x-player.x,p.y-player.y)<10){if(p.type==='gold'){runGold+=p.val;toast(`+${p.val} gold`)}else{addSpellToWand(p.spell);toast(`获得法术：${spellName(p.spell)}`)}pickups.splice(i,1)}}}
function updatePlayer(){let left=keys.a||keys.ArrowLeft,right=keys.d||keys.ArrowRight,jump=keys.w||keys.ArrowUp||keys[' '];let accel=(right?1:0)-(left?1:0);if(accel){player.vx+=accel*.15;player.dir=accel}player.vx*=.82;player.vx=clamp(player.vx,-1.5,1.5);player.onGround=solidAtRect(player.x,player.y+player.h/2+1,player.w,2);if(jump&&player.onGround){player.vy=-3.1;player.onGround=false}hoverHeld=jump&&!player.onGround;if(hoverHeld&&player.hover>0){player.vy=Math.min(player.vy,.2);player.hover-=.7}else{player.vy+=.16;player.hover=Math.min(player.maxHover,player.hover+(player.perk.flight?.44:.22))}player.vy=clamp(player.vy,-4,3.2);moveBody(player,player.vx,0,player.w,player.h);moveBody(player,0,player.vy,player.w,player.h);if(player.inv>0)player.inv--;if(player.wet>0)player.wet--;if(get(player.x,player.y)===MAT.FIRE)hurt(2,'火焰灼烧');if(LIQ.has(get(player.x,player.y))&&get(player.x,player.y)!==MAT.WATER)hurt(.5,'危险液体');for(const w of wands){w.mana=Math.min(w.manaMax,w.mana+w.regen/60);if(w.timer>0)w.timer--}if(pointer.down)cast();}
function updateWands(){if(keys['1']){currentWand=0;keys['1']=false}if(keys['2']){currentWand=1;keys['2']=false}if(keys['3']){currentWand=2;keys['3']=false}if(keys['4']){currentWand=3;keys['4']=false}}
function update(){if(gameState!=='play')return;frame++;updateWands();updatePlayer();updateMaterials();updateProjectiles();updateEnemies();updatePickups();cameraY=clamp(player.y-VH*.5,0,H-VH);runDepth=Math.max(runDepth,Math.floor(player.y));const h=world.holy.findIndex(x=>player.y>=x.y0&&player.y<x.y1);if(h>=0&&!holySeen.has(h)){holySeen.add(h);offerPerks(h)}if(player.y>H-90&&enemies.some(e=>e.type==='boss'))toast('终焉之眼正在注视你');if(frame%12===0)updateHud();}

function draw(){if(!world){ctx.fillStyle='#080910';ctx.fillRect(0,0,VW,VH);return}const b=biomeAt(cameraY+VH*.5);ctx.fillStyle=b.bg;ctx.fillRect(0,0,VW,VH);let y0=Math.floor(cameraY);for(let sy=0;sy<VH;sy++){let wy=y0+sy;for(let x=0;x<W;x++){let m=get(x,wy);if(m!==MAT.AIR){ctx.fillStyle=MAT_COL[m];ctx.fillRect(x,sy,1,1)}}}for(let p of particles){let sy=p.y-cameraY;if(sy<-5||sy>VH+5)continue;if(p.kind==='boom'){ctx.globalAlpha=p.life/p.max;ctx.strokeStyle='#ffc45e';ctx.beginPath();ctx.arc(p.x,sy,p.rad*(1-p.life/p.max),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1}else{ctx.fillStyle=p.kind==='blood'?'#c54858':'#f6c95c';ctx.fillRect(p.x|0,sy|0,1,1)}}for(const p of pickups){let sy=p.y-cameraY;ctx.fillStyle=p.type==='gold'?'#f4ca53':'#ad8aff';ctx.fillRect(p.x-2,sy-2,4,4);ctx.fillStyle='#fff';ctx.fillRect(p.x-1,sy-3,1,1)}for(const p of projectiles){let sy=p.y-cameraY;ctx.fillStyle=p.color;ctx.fillRect(p.x-1,sy-1,3,3);if(p.fire){ctx.fillStyle='#ffbc4c';ctx.fillRect(p.x-2,sy,1,1)}}for(const e of enemies){let sy=e.y-cameraY;if(sy<-12||sy>VH+12)continue;ctx.save();ctx.translate(e.x,sy);if(e.type==='boss'){ctx.fillStyle='#b33fbb';ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff29c';ctx.fillRect(-3,-3,6,6);ctx.fillStyle='#4f194f';ctx.fillRect(-1,-1,2,2)}else if(e.type==='shooter'){ctx.fillStyle='#c45762';ctx.fillRect(-4,-4,8,8);ctx.fillStyle='#f2d56f';ctx.fillRect(3,-1,3,2)}else if(e.type==='bat'){ctx.fillStyle='#c8698d';ctx.fillRect(-4,-2,8,4);ctx.fillRect(-6,-1,2,2);ctx.fillRect(4,-1,2,2)}else{ctx.fillStyle='#b7c6b8';ctx.fillRect(-3,-5,6,10);ctx.fillStyle='#222433';ctx.fillRect(-2,-3,4,2)}ctx.restore();if(e.hp<e.max){ctx.fillStyle='#151522';ctx.fillRect(e.x-6,sy-9,12,1);ctx.fillStyle='#df6871';ctx.fillRect(e.x-6,sy-9,12*(e.hp/e.max),1)}}if(!player.dead){let sy=player.y-cameraY;ctx.save();ctx.translate(Math.round(player.x),Math.round(sy));if(player.inv%4<2)ctx.globalAlpha=.45;ctx.fillStyle='#e3b9da';ctx.fillRect(-2,-6,4,4);ctx.fillStyle='#5564a4';ctx.fillRect(-3,-2,6,7);ctx.fillStyle='#252945';ctx.fillRect(-4,5,3,3);ctx.fillRect(1,5,3,3);ctx.fillStyle='#f4d48b';ctx.fillRect(player.dir>0?3:-4,-1,2,2);ctx.restore()}ctx.fillStyle='#fff';ctx.globalAlpha=.08;for(let i=0;i<12;i++)ctx.fillRect(rint(0,VW),rint(0,VH),1,1);ctx.globalAlpha=1;drawHolyOverlay();}
function drawHolyOverlay(){for(const h of world.holy){let sy=h.y0-cameraY;if(sy>VH||sy+44<0)continue;ctx.fillStyle='#d4b5e91a';ctx.fillRect(44,Math.max(0,sy+4),232,38);ctx.strokeStyle='#b795d855';ctx.strokeRect(44,sy+4,232,38)}}

function updateHud(){const hp=clamp(player.hp/player.maxHp,0,1),ma=clamp(wands[currentWand].mana/wands[currentWand].manaMax,0,1),ho=clamp(player.hover/player.maxHover,0,1);$('hpFill').style.width=(hp*100)+'%';$('manaFill').style.width=(ma*100)+'%';$('hoverFill').style.width=(ho*100)+'%';$('hpText').textContent=`${Math.ceil(Math.max(0,player.hp))}/${player.maxHp}`;$('manaText').textContent=Math.floor(wands[currentWand].mana);$('depth').textContent=`${Math.floor(runDepth)}m`;$('gold').textContent=`${runGold} gold`;$('biome').textContent=biomeAt(player.y).name;let html='';wands.forEach((w,i)=>{html+=`<div class="wand-chip ${i===currentWand?'active':''}"><b>${i+1} · ${w.name}</b><span>${w.timer>0?'冷却中':'就绪'} · ${Math.floor(w.mana)}/${w.manaMax}</span><div class="slotdots">${w.slots.map(s=>`<s class="on" title="${spellName(s.id)}"></s>`).join('')}</div></div>`});$('wandHud').innerHTML=html}
function toast(text){const el=$('toast');el.textContent=text;el.style.opacity=1;logTimer=90}
function tickToast(){if(logTimer>0){logTimer--;if(!logTimer)$('toast').style.opacity=0}}
function offerPerks(){const defs=[{name:'血肉护甲',desc:'受到的伤害降低 50%。',apply:()=>player.perk.resist=true},{name:'玻璃大炮',desc:'法术伤害与爆炸范围翻倍，但最大生命减半。',apply:()=>{player.perk.power=true;player.maxHp=50;player.hp=Math.min(player.hp,50)}},{name:'暴击直觉',desc:'20% 几率造成双倍法术伤害。',apply:()=>player.perk.crit=true},{name:'长久飞行',desc:'悬浮燃料回复速度翻倍。',apply:()=>player.perk.flight=true},{name:'炼金之血',desc:'敌人死亡时额外掉落金币和血液。',apply:()=>player.perk.alchemy=true},{name:'魔杖工匠',desc:'在任何地方按 E 都能编辑魔杖。',apply:()=>player.perk.tinker=true}];perkChoices=[defs[rint(0,defs.length-1)],defs[rint(0,defs.length-1)],defs[rint(0,defs.length-1)]];while(new Set(perkChoices).size<3)perkChoices=[defs[rint(0,defs.length-1)],defs[rint(0,defs.length-1)],defs[rint(0,defs.length-1)]];renderPerks();}
function renderPerks(){$('perkPanel').innerHTML=`<div class="panel-title"><b>HOLY MOUNTAIN · 选择一项永久祝福</b><span>点击卡片或按 1 / 2 / 3</span></div><div class="perk-grid">${perkChoices.map((p,i)=>`<button class="perk" data-perk="${i}"><b>${i+1}. ${p.name}</b><small>${p.desc}</small></button>`).join('')}</div>`;$('perkPanel').classList.remove('hide')}
function choosePerk(i){let p=perkChoices[i];if(!p)return;p.apply();toast(`获得祝福：${p.name}`);perkChoices=[];$('perkPanel').classList.add('hide');sound('perk')}
function renderWands(){$('wandPanel').innerHTML=`<div class="panel-title"><b>魔杖编辑台</b><span>点击两个法术交换位置 · E 关闭</span></div><div class="wand-grid">${wands.map((w,wi)=>`<div class="wand-card ${wi===currentWand?'active':''}"><h3>${wi+1}. ${w.name}</h3><div class="stats"><span>Cast ${w.castDelay}</span><span>Recharge ${w.recharge}</span><span>Mana ${Math.floor(w.mana)}/${w.manaMax}</span><span>Regen ${w.regen}/s</span></div><div class="spell-row">${w.slots.map((s,si)=>`<button class="spell-btn" data-w="${wi}" data-s="${si}">${spellName(s.id)}</button>`).join('')}</div></div>`).join('')}<button class="primary" id="addSpell">把随机法术加入当前魔杖</button></div>`;$('wandPanel').classList.remove('hide')}
let selectedSlot=null;function handleWandClick(e){let b=e.target.closest('.spell-btn');if(b){let wi=+b.dataset.w,si=+b.dataset.s;if(selectedSlot){let [a,c]=[selectedSlot,{wi,si}];[wands[a.wi].slots[a.si],wands[c.wi].slots[c.si]]=[wands[c.wi].slots[c.si],wands[a.wi].slots[a.si]];selectedSlot=null;renderWands()}else{selectedSlot={wi,si};b.classList.add('selected')}}if(e.target.id==='addSpell'){wands[currentWand].slots.push({id:rng()<.65?randomSpell():['triple','homing','fire','explosive','bouncy','critical','mana'][rint(0,6)]});renderWands()}}
function addSpellToWand(id){wands[currentWand].slots.push({id});if(wands[currentWand].slots.length>8)wands[currentWand].slots.shift()}

function startGame(){seed=Date.now()^Math.floor(Math.random()*1e9);rng=makeRng(seed);setupWands();generateWorld();gameState='play';$('title').classList.add('hide');$('dead').classList.add('hide');$('win').classList.add('hide');$('wandPanel').classList.add('hide');$('perkPanel').classList.add('hide');updateHud();toast(`种子 ${seed>>>0}`);sound('start')}
function loop(){update();draw();tickToast();requestAnimationFrame(loop)}
function sound(kind){try{let ac=sound.ac||(sound.ac=new AudioContext()),o=ac.createOscillator(),g=ac.createGain();let f={cast:420,boom:90,perk:660,start:240,dead:70,win:880}[kind]||300;o.frequency.value=f;o.type=kind==='boom'?'sawtooth':'square';g.gain.value=.025;o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+.06)}catch(e){}}

window.addEventListener('keydown',e=>{keys[e.key]=true;if(['ArrowLeft','ArrowRight','ArrowUp',' ','a','d','w'].includes(e.key))e.preventDefault();if(e.key==='e'&&!perkChoices.length&&(player?.perk.tinker||inHoly(player?.y||0))){editMode=!editMode;if(editMode)renderWands();else $('wandPanel').classList.add('hide')}if(perkChoices.length&&['1','2','3'].includes(e.key))choosePerk(+e.key-1)});
window.addEventListener('keyup',e=>keys[e.key]=false);
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer.x=clamp((e.clientX-r.left)/r.width*VW,0,VW);pointer.y=clamp((e.clientY-r.top)/r.height*VH,0,VH);pointer.active=true});canvas.addEventListener('pointerdown',e=>{if(gameState==='play'){pointer.down=true;canvas.setPointerCapture(e.pointerId);sound('cast')}});canvas.addEventListener('pointerup',()=>pointer.down=false);canvas.addEventListener('pointerleave',()=>{if(!matchMedia('(pointer:coarse)').matches)pointer.down=false});
['leftBtn','rightBtn','jumpBtn'].forEach(id=>{let k=id==='leftBtn'?'a':id==='rightBtn'?'d':'w',b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true});b.addEventListener('pointerup',e=>{e.preventDefault();keys[k]=false});b.addEventListener('pointerleave',()=>keys[k]=false)});$('fireBtn').addEventListener('pointerdown',e=>{e.preventDefault();pointer.down=true});$('fireBtn').addEventListener('pointerup',()=>pointer.down=false);$('wandBtn').addEventListener('click',()=>{currentWand=(currentWand+1)%wands.length;updateHud()});
$('startBtn').addEventListener('click',startGame);$('restartBtn').addEventListener('click',startGame);$('winBtn').addEventListener('click',startGame);$('perkPanel').addEventListener('click',e=>{let b=e.target.closest('[data-perk]');if(b)choosePerk(+b.dataset.perk)});$('wandPanel').addEventListener('click',handleWandClick);
loop();
