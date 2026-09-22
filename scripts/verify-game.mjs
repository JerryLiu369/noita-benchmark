/* Run against the static server on 4173. Chrome and Node are the only test tools. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root=new URL('../',import.meta.url).pathname;
const output=join(root,'test-results');await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'ember-verify-'));
const browser=spawn(process.env.CHROME_BIN||'/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let socket;
const results=[],errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try {
  const port=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Chrome did not start')),15000);
    browser.on('error',reject);browser.stderr.on('data',chunk=>{const match=String(chunk).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);if(match){clearTimeout(timeout);resolve(Number(match[1]));}});
  });
  const tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  let serial=0;const pending=new Map();
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const ev=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const key=(key,type='keyDown')=>call('Input.dispatchKeyEvent',{type,key,code:key===' '?'Space':key.length===1?'Key'+key.toUpperCase():key});
  const mouse=(x,y,type='mouseMoved',buttons=0)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:buttons,clickCount:type==='mouseMoved'?0:1});
  const center=selector=>ev(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const click=async selector=>{const r=await center(selector);await mouse(r.x,r.y,'mousePressed');await mouse(r.x,r.y,'mouseReleased');};
  const screenshot=async name=>{await ev('render()');const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));};
  const check=(name,data)=>{results.push({name,...data});console.log('PASS',name,JSON.stringify(data));};
  await call('Runtime.enable');await call('Page.enable');
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:4173/?seed=84321'});await sleep(1100);
  assert.equal(await ev('state'),'play');
  const initial=await ev('({x:player.x,y:player.y})');
  await key('d');await sleep(450);await key('d','keyUp');const moved=await ev('({x:player.x,y:player.y})');assert(moved.x>initial.x+5);
  await key('w');await sleep(300);await key('w','keyUp');const jumped=await ev('({x:player.x,y:player.y})');assert(jumped.y<moved.y-10);
  await sleep(900);const playStarted=Date.now();
  for(let i=0;i<14;i++) {
    const e=await ev('enemies.find(e=>!e.dead&&e.type==="charger"&&e.level===0)&&({x:enemies.find(e=>!e.dead&&e.type==="charger"&&e.level===0).x,y:enemies.find(e=>!e.dead&&e.type==="charger"&&e.level===0).y})');
    if(!e)break;
    const p=await ev(`({x:(${e.x}-camera.x)/VW*innerWidth,y:(${e.y}-camera.y)/VH*innerHeight})`);await mouse(p.x,p.y,'mousePressed');await sleep(220);await mouse(p.x,p.y,'mouseReleased');
  }
  const combat=await ev('({kills,hp:player.hp,seconds:elapsedTicks/30,state})');assert(combat.kills>=1,JSON.stringify(combat));assert.equal(await ev('state'),'play');
  await screenshot('desktop');await key('Escape');
  check('Natural keyboard, jump and projectile kill',{initial,moved,jumped,...combat,combatWallSeconds:(Date.now()-playStarted)/1000});

  const lighting=await ev(`(()=>{render();const data=ctx.getImageData(0,0,VW,VH).data;let bright=0,dark=0,opaque=0;for(let i=0;i<data.length;i+=4){const v=(data[i]+data[i+1]+data[i+2])/3;if(v>45)bright++;if(v<12)dark++;if(data[i+3]===255)opaque++;}return {bright,dark,opaque,total:VW*VH};})()`);
  assert(lighting.bright>500&&lighting.dark>1000&&lighting.opaque===lighting.total);check('Nonblank terrain and opaque lighting',lighting);

  const routes=await ev(`(()=>{
    const results=[];
    for(const testSeed of [84321,1,72,999,314159]){
      seed=testSeed;rng=randomGenerator(seed);generateWorld();const step=4,cols=W/step,rows=Math.floor(H/step),count=cols*rows,open=new Uint8Array(count),seen=new Uint8Array(count),queue=new Int32Array(count);
      for(let gy=2;gy<rows-2;gy++)for(let gx=2;gx<cols-2;gx++)open[gy*cols+gx]=!blocked(gx*step,gy*step,player.w,player.h);
      let head=0,tail=0;const first=Math.round(player.y/step)*cols+Math.round(player.x/step);queue[tail++]=first;seen[first]=1;
      while(head<tail){const p=queue[head++];for(const n of [p-1,p+1,p-cols,p+cols])if(n>=0&&n<count&&open[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}}
      results.push({seed:testSeed,sanctuaries:sanctuaries.map(s=>!!seen[Math.round((s.y+26)/step)*cols+Math.round(150/step)]),boss:!!seen[Math.round(2024/step)*cols+Math.round(270/step)],embedded:enemies.filter(e=>e.type!=='burrower'&&blocked(e.x,e.y,e.w,e.h)).length});
    }
    startGame();pause();return results;
  })()`);
  assert(routes.every(r=>r.sanctuaries.every(Boolean)&&r.boss&&r.embedded===0));check('Five seeds have routes through all five layers',{routes});

  const physics=await ev(`(()=>{
    const result={};rect(20,20,20,30,M.BRICK);rect(23,23,14,25,M.AIR);rect(23,27,14,5,M.BLOOD);rect(23,32,14,5,M.WATER);rect(23,37,14,5,M.OIL);
    for(let n=0;n<180;n++){tick++;simulateMaterials(20,51);}result.density=[];
    for(const m of [M.OIL,M.WATER,M.BLOOD]){let count=0,total=0;for(let y=20;y<51;y++)for(let x=20;x<40;x++)if(get(x,y)===m){total+=y;count++;}result.density.push({meanY:total/count,count});}
    rect(50,20,8,8,M.AIR);put(53,24,M.LAVA);put(54,24,M.WATER);tick++;reactCell(53,24);result.lava=[get(53,24),get(54,24)];
    rect(65,20,8,8,M.AIR);put(68,24,M.FIRE,80);put(69,24,M.WATER);tick++;reactCell(68,24);result.extinguished=get(68,24)===M.STEAM;
    rect(80,20,12,20,M.AIR);put(86,36,M.GAS,80);for(let n=0;n<8;n++){tick++;simulateMaterials(20,40);}result.gasRose=get(86,28)===M.GAS;
    rect(100,20,12,12,M.BRICK);put(105,25,M.ACID);for(let n=0;n<80;n++){tick++;reactCell(105,25);}result.acidCorroded=[get(104,25),get(106,25),get(105,24),get(105,26)].includes(M.GAS);
    rect(120,20,10,10,M.ROCK);result.weakDig=dig(125,25,2,1,100);result.strongDig=dig(125,25,2,6,100);result.exhaustedDig=dig(125,25,3,10,1);
    rect(145,20,16,12,M.AIR);put(152,26,M.FIRE,90);put(153,26,M.WOOD);let spread=false;for(let n=0;n<120;n++){tick++;reactCell(152,26);if(get(153,26)===M.FIRE)spread=true;}result.fireSpread=spread;
    for(let n=0;n<250;n++){tick++;simulateMaterials(20,34);}result.fireExpired=get(152,26)!==M.FIRE&&get(153,26)!==M.FIRE;
    startGame();pause();return result;
  })()`);
  assert(physics.density[0].meanY<physics.density[1].meanY&&physics.density[1].meanY<physics.density[2].meanY);assert(physics.density.every(d=>d.count===70));assert.deepEqual(physics.lava,[14,19]);
  assert(physics.extinguished&&physics.gasRose&&physics.acidCorroded&&physics.fireSpread&&physics.fireExpired);assert.equal(physics.weakDig,0);assert(physics.strongDig>0);assert.equal(physics.exhaustedDig,0);check('Density, reactions, gases, fire and dig energy',physics);

  const magic=await ev(`(()=>{
    const result={},a=readCast(['scatter','flame','homing','spark','arrow']),b=readCast(['spark','power','arrow']),c=readCast(['impact','timer','homing','ember']);
    result.ordered=a.next===4&&a.node.id==='spark'&&a.node.mods.scatter===3&&a.node.mods.flame&&a.node.mods.homing&&b.node.mods.power===1&&b.next===1;
    result.nested=c.node.payload.id==='timer'&&c.node.payload.payload.id==='ember'&&c.node.payload.payload.mods.homing&&c.mana===53;
    rect(65,65,190,55,M.AIR);player.x=90;player.y=92;enemies=[];projectiles=[];state='play';activeSanctuary=null;aim={x:230,y:92,down:false,touch:false};camera={x:0,y:0};
    wands[0]=makeWand('验收',['impact','scatter','spark'],3,{mana:120,delay:8,recharge:22});cast();result.prepaid=wands[0].mana===91;result.recharge=wands[0].cooldown===22;
    const p=projectiles[0];releasePayload(p);releasePayload(p);result.payloadCount=projectiles.length===4;
    projectiles=[];spawnCast(readCast(['timer','water']).node,100,90,0);for(let n=0;n<18;n++)updateProjectiles();result.timerReleased=projectiles.some(p=>p.id==='water');
    projectiles=[];rect(130,80,3,25,M.ROCK);spawnCast(readCast(['impact','frost']).node,112,90,0);for(let n=0;n<4;n++)updateProjectiles();result.impactReleased=projectiles.some(p=>p.id==='frost');
    startGame();pause();return result;
  })()`);
  assert(Object.values(magic).every(Boolean));check('Spell order, nested payload, mana and recharge',magic);

  // Environment fixtures use the normal damage paths; they are not a natural playthrough.
  const deaths=await ev(`(()=>{
    const results=[];
    for(const cause of ['烧死','溺死','压死','毒死','被击杀']){
      startGame();enemies=[];projectiles=[];rect(80,60,100,65,M.AIR);player.x=120;player.y=90;player.hp=.01;player.inv=0;state='play';
      if(cause==='烧死'){player.burning=100;updatePlayer();}
      if(cause==='溺死'){player.breath=0;put(120,84,M.WATER);updatePlayer();}
      if(cause==='压死'){debris=[{x:120,y:86,vy:2,r:6,falling:true,dead:false}];updateDebris();}
      if(cause==='毒死'){put(120,90,M.GAS,90);updatePlayer();}
      if(cause==='被击杀'){const e={x:113,y:90,level:0};enemyShot(e,0,3);for(let n=0;n<4;n++)updateProjectiles();}
      results.push({cause,state,text:$('deadReason').textContent,visible:!$('resultPanel').classList.contains('hide')});
    }
    return results;
  })()`);
  assert(deaths.every(d=>d.state==='dead'&&d.visible&&d.text===`死因：${d.cause}`));await screenshot('death');check('Five explicit causes through damage paths',{deaths});
  await click('#restartBtn');const restarted=await ev('({state,hp:player.hp,kills,gold,stored:storage.filter(Boolean).length,seen:sanctuaries.some(s=>s.visited)})');assert(restarted.state==='play'&&restarted.hp===100&&restarted.kills===0&&restarted.gold===0&&!restarted.seen);check('Restart clears the entire run',restarted);

  await ev('pause();player.x=145;player.y=sanctuaries[0].y+25;player.hp=5;wands[0].mana=2;closePanels();updateInteraction();');
  assert.equal(await ev('state'),'perk');await click('[data-perk="0"]');assert.equal(await ev('state'),'editor');
  const from=await center('[data-group="storage"][data-index="0"]'),to=await center('[data-group="0"][data-index="0"]');
  await mouse(from.x,from.y,'mousePressed');await mouse(to.x,to.y,'mouseMoved',1);await mouse(to.x,to.y,'mouseReleased');
  assert.equal(await ev('wands[0].slots[0]'),'scatter');assert.equal(await ev('storage[0]'),'spark');
  await screenshot('editor-desktop');check('Desktop drag swaps storage and wand slot',{capacity:await ev('wands[0].capacity')});
  await ev('gold=100;renderEditor()');await click('[data-buy="1"]');assert.equal(await ev('gold'),70);assert.equal(await ev('activeSanctuary.shop[1].sold'),true);assert(await ev('storage.includes("flame")'));
  await ev('closePanels();openEditor()');assert.equal(await ev('activeSanctuary.perk'),true);check('Sanctuary healing, single perk and paid shop',{hp:await ev('player.hp'),gold:await ev('gold')});

  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await sleep(200);
  const touch=async(type,points)=>call('Input.dispatchTouchEvent',{type,touchPoints:points});
  const tf=await center('[data-group="storage"][data-index="1"]'),tt=await center('[data-group="0"][data-index="1"]');
  await touch('touchStart',[{...tf,id:1}]);await touch('touchMove',[{...tt,id:1}]);await touch('touchEnd',[]);
  assert.equal(await ev('wands[0].slots[1]'),'homing');await screenshot('editor-mobile');
  await ev('closePanels();startGame()');await sleep(300);
  const right=await center('#rightBtn'),fire=await center('#fireBtn'),jump=await center('#jumpBtn'),before=await ev('({x:player.x,y:player.y})');
  await touch('touchStart',[{...right,id:1},{...fire,id:2},{...jump,id:3}]);await touch('touchMove',[{...right,id:1},{x:fire.x+24,y:fire.y-20,id:2},{...jump,id:3}]);await sleep(450);
  const during=await ev('({x:player.x,y:player.y,angle:aim.angle,down:aim.down,touch:aim.touch,mana:wands[0].mana,projectiles:projectiles.filter(p=>p.owner==="player").length,cooldown:wands[0].cooldown})');
  await touch('touchEnd',[]);const released=await ev('!keys.d&&!keys.w&&!aim.down');
  assert(during.x>before.x+5&&during.y<before.y-10&&during.touch&&during.down&&during.angle<-.2&&(during.projectiles>0||during.cooldown>0)&&released,JSON.stringify({before,during,released}));
  await screenshot('mobile');await ev('pause()');
  const mobile=await ev('({overflow:document.documentElement.scrollWidth>innerWidth,ratio:canvas.clientWidth/canvas.clientHeight,canvasRatio:VW/VH})');assert(!mobile.overflow&&Math.abs(mobile.ratio-mobile.canvasRatio)<.002);
  check('Touch drag, simultaneous movement, jump and aimed fire',{before,during,released,...mobile});
  for(const [width,height] of [[844,390],[320,568],[1920,1080]]){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000});await ev('closePanels()');await screenshot(`viewport-${width}x${height}`);await ev('pause()');assert.equal(await ev('document.documentElement.scrollWidth>innerWidth'),false);}
  check('Portrait, landscape and wide desktop layouts',{sizes:['390x844','844x390','320x568','1440x900','1920x1080']});
  await call('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});
  await ev('player.x=134;player.y=104;updateInteraction();updateHud();');
  const overlap=await ev(`(()=>{const a=$('interactBtn').getBoundingClientRect(),b=$('loadout').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;})()`);
  assert.equal(overlap,false);await screenshot('mobile-interaction');check('Narrow mobile interaction clears the loadout',{overlap});
  assert.deepEqual(errors,[]);check('No browser runtime exceptions',{count:errors.length});
  await writeFile(join(output,'results.json'),JSON.stringify({date:new Date().toISOString(),results},null,2)+'\n');
  console.log(`Verified ${results.length} checks. Screenshots and results: ${output}`);
} finally {
  socket?.close();browser.kill('SIGTERM');await new Promise(resolve=>{if(browser.exitCode!==null)resolve();else browser.once('exit',resolve);});await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
}
