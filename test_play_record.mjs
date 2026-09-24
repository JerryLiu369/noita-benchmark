import fs from 'node:fs';
const CDP='http://127.0.0.1:9222';
const url='http://127.0.0.1:4387/';
const target=await (await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`,{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});
let id=0;const pending=new Map();const errors=[];const logs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry);else if(m.method==='Runtime.consoleAPICalled')logs.push(m.params)};
const send=(method,params={})=>{const i=++id;ws.send(JSON.stringify({id:i,method,params}));return new Promise(r=>pending.set(i,r))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text);return r.result.result.value}
async function waitFrames(n){const f=await ev('__ASHFALL_DEBUG__.state().frame');for(let i=0;i<100;i++){await sleep(40);if(await ev('__ASHFALL_DEBUG__.state().frame')>=f+n)return;}throw new Error('frame timeout')}
async function key(type,key,code,vk,text){await send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,...(text?{text,unmodifiedText:text}:{})})}
async function click(sel){const r=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:r.x,y:r.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1})}
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
await sleep(400);await click('#startBtn');await waitFrames(25);await ev("document.querySelector('#game').focus(); D=window.__ASHFALL_DEBUG__; true");
const wall0=Date.now();
await key('keyDown','d','KeyD',68,'d');await sleep(350);await key('keyUp','d','KeyD',68);await sleep(120);
await key('keyDown','w','KeyW',87,'w');let jump=await ev('D.state()'),minJumpY=jump.player.y;for(let i=0;i<6;i++){await sleep(50);jump=await ev('D.state()');minJumpY=Math.min(minJumpY,jump.player.y)}await key('keyUp','w','KeyW',87);await sleep(300);
await key('keyDown','3','Digit3',51,'3');await key('keyUp','3','Digit3',51);await sleep(120);
await ev("D.clearEnemies();D.setPlayerStat('hp',10000);D.setPlayerStat('grace',999999);D.spawnEnemy('stalker',20);true");
const started=await ev('D.state()');const rect=await ev("(()=>{const r=document.querySelector('#game').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()");
let s=started,targetEnemy=s.debugEnemies[0];let x=rect.x+(targetEnemy.x/480)*rect.w,y=rect.y+((targetEnemy.y-s.cameraY)/270)*rect.h;
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
for(let n=0;n<60;n++){await sleep(80);s=await ev('D.state()');targetEnemy=s.debugEnemies.find(e=>e.type==='stalker');if(targetEnemy){x=rect.x+(targetEnemy.x/480)*rect.w;y=rect.y+((targetEnemy.y-s.cameraY)/270)*rect.h;await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'left',buttons:1})}if(s.kills>started.kills)break}
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});await sleep(120);
const combat=await ev('D.state()');const combatWallMs=Date.now()-wall0;
const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync('/tmp/opencode/ashfall-play-record.png',Buffer.from(shot.result.data,'base64'));
await ev("(()=>{const p=D.state().player,x=Math.floor(p.x),y=Math.floor(p.y);D.setPlayerStat('hp',12);D.setPlayerStat('grace',0);for(let yy=y-7;yy<=y+7;yy++)for(let xx=x-4;xx<=x+4;xx++)D.setCell(xx,yy,'ACID');D.step(20);return true})()");
const death=await ev("({state:D.state(),cause:document.querySelector('#deathCause').textContent,stats:document.querySelector('#deathStats').textContent,visible:!document.querySelector('#death').classList.contains('hidden')})");
const totalWallMs=Date.now()-wall0;
await click('#restartBtn');await ev('D.step(20)');const restarted=await ev('D.state()');
const result={started,jump:{y:jump.player.y,minY:minJumpY,rose:minJumpY<started.player.y-1},combat:{seconds:combat.seconds,frame:combat.frame,kills:combat.kills,hp:combat.player.hp,wallMs:combatWallMs},death:{seconds:death.state.seconds,kills:death.state.kills,cause:death.cause,stats:death.stats,visible:death.visible,wallMs:totalWallMs},restarted:{state:restarted.state,hp:restarted.player.hp,kills:restarted.kills,gold:restarted.gold,deathHidden:await ev("document.querySelector('#death').classList.contains('hidden')")},errors,consoleCount:logs.length};
fs.writeFileSync('/tmp/opencode/ashfall-play-record.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!(combat.kills===1&&death.cause==='酸蚀而死'&&death.state.kills===1&&restarted.kills===0&&restarted.player.hp===100&&errors.length===0))process.exitCode=1;await send('Page.close');ws.close();
