import fs from 'node:fs';

const CDP = 'http://127.0.0.1:9222';
const GAME = 'http://127.0.0.1:4387/';
const target = await (await fetch(`${CDP}/json/new?${encodeURIComponent(GAME)}`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let id = 0;
const pending = new Map();
const errors = [];
const consoleMessages = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  } else if (message.method === 'Runtime.exceptionThrown') {
    errors.push({ type: 'exception', detail: message.params.exceptionDetails });
  } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    errors.push({ type: 'log', detail: message.params.entry });
  } else if (message.method === 'Runtime.consoleAPICalled') {
    consoleMessages.push(message.params);
  }
};
const send = (method, params = {}) => {
  const requestId = ++id;
  ws.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise(resolve => pending.set(requestId, resolve));
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.result?.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text);
  }
  return response.result?.result?.value;
}
async function waitFor(expression, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await evaluate(expression)) return true; } catch (_) { /* 页面仍在初始化 */ }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}
async function waitFrames(count = 10, timeout = 5000) {
  const start = await evaluate('__ASHFALL_DEBUG__.state().frame');
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    await sleep(40);
    const frame = await evaluate('__ASHFALL_DEBUG__.state().frame');
    if (frame >= start + count) return frame;
  }
  throw new Error(`Frame wait timed out (+${count})`);
}
async function viewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
}
async function click(selector) {
  await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw new Error('Missing ${selector}'); el.scrollIntoView({block:'center',inline:'center'}); return true; })()`);
  const rect = await evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}; })()`);
  if (rect.w <= 0 || rect.h <= 0) throw new Error(`Zero-size selector: ${selector}`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(60);
}
async function keyDown(key, code, keyCode, text = key.length === 1 ? key : undefined) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, ...(text ? { text, unmodifiedText: text } : {}) });
}
async function keyUp(key, code, keyCode) {
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
}
async function keyPress(key, code, keyCode) {
  await keyDown(key, code, keyCode, key.length === 1 ? key : undefined);
  await keyUp(key, code, keyCode);
  await sleep(100);
}
async function mouseDown(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
}
async function mouseMove(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
}
async function mouseUp(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}
async function touchDown(x, y, id = 1) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id, radiusX: 2, radiusY: 2, force: 1 }] });
}
async function touchUp() {
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function screenshot(path) {
  const response = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path, Buffer.from(response.result.data, 'base64'));
}
async function state() { return evaluate('__ASHFALL_DEBUG__.state()'); }

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.bringToFront');
await viewport(1280, 720, false);
await waitFor(`document.readyState === 'complete' && !!window.__ASHFALL_DEBUG__`);
await sleep(300);

const dom = await evaluate(`({
  title: document.title,
  canvas: !!document.querySelector('#game'),
  startButton: !!document.querySelector('#startBtn'),
  wandSlots: document.querySelectorAll('#wandBar [data-wand-index]').length,
  touchControls: !!document.querySelector('#touchControls'),
  externalAssets: [...document.querySelectorAll('script[src],link[href],img[src]')].map(el => el.src || el.href).filter(url => /^https?:/.test(url) && !url.startsWith(location.origin))
})`);
await click('#startBtn');
await waitFrames(30);
const started = await state();
await evaluate(`document.querySelector('#game').focus(); window.__ashfallTrustedKeys=[]; addEventListener('keydown',e=>__ashfallTrustedKeys.push({type:e.type,key:e.key,code:e.code,trusted:e.isTrusted})); addEventListener('keyup',e=>__ashfallTrustedKeys.push({type:e.type,key:e.key,code:e.code,trusted:e.isTrusted})); true`);

const beforeMove = await state();
await keyDown('d', 'KeyD', 68, 'd');
await sleep(400);
const duringMove = await state();
await keyUp('d', 'KeyD', 68);
await sleep(180);
const beforeJump = await state();
await keyDown('w', 'KeyW', 87, 'w');
await sleep(150);
const duringJump = await state();
await keyUp('w', 'KeyW', 87);
await sleep(420);
const afterJump = await state();
await keyPress('2', 'Digit2', 50);
const afterDigit2 = await state();
await keyPress('q', 'KeyQ', 81);
const afterQ = await state();
await keyPress('1', 'Digit1', 49);
const afterDigit1 = await state();
const trustedKeys = await evaluate('__ashfallTrustedKeys');

const castPlans = await evaluate(`[0,1,2,3].map(i => __ASHFALL_DEBUG__.inspectCast(i))`);
await evaluate(`__ASHFALL_DEBUG__.clearEnemies(); __ASHFALL_DEBUG__.setPlayerStat('hp',10000); __ASHFALL_DEBUG__.setPlayerStat('grace',999999); true`);
const canvasRect = await evaluate(`(() => { const r=document.querySelector('#game').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
const spawnCombatTarget = await evaluate(`__ASHFALL_DEBUG__.spawnEnemy('stalker', 12)`);
const combatStart = await state();
let combatEnd = combatStart;
let maxCombatProjectiles = 0;
let minTargetHp = spawnCombatTarget.hp;
let combatSawDamage = false;
let aimX = canvasRect.x + canvasRect.w * .75;
let aimY = canvasRect.y + canvasRect.h * .5;
const initialCombatTarget = combatStart.debugEnemies.find(e => e.type === 'stalker');
if (initialCombatTarget) aimY = canvasRect.y + ((initialCombatTarget.y - combatStart.cameraY) / 270) * canvasRect.h;
await mouseDown(aimX, aimY);
for (let n = 0; n < 50; n++) {
  await sleep(100);
  combatEnd = await state();
  maxCombatProjectiles = Math.max(maxCombatProjectiles, combatEnd.projectiles);
  const target = combatEnd.debugEnemies.find(e => e.type === 'stalker');
  if (target) {
    minTargetHp = Math.min(minTargetHp, target.hp);
    combatSawDamage ||= target.hp < target.maxHp;
    aimX = canvasRect.x + (target.x / 480) * canvasRect.w;
    aimY = canvasRect.y + ((target.y - combatEnd.cameraY) / 270) * canvasRect.h;
  }
  await mouseMove(aimX, aimY);
  if (combatEnd.kills > combatStart.kills) break;
}
await mouseUp(aimX, aimY);
await sleep(180);
combatEnd = await state();

await keyPress('3', 'Digit3', 51);
const scatterTarget = await evaluate(`__ASHFALL_DEBUG__.spawnEnemy('stalker', 32)`);
let scatterEnd = await state();
let maxEmberProjectiles = 0;
aimX = canvasRect.x + canvasRect.w * .78;
await mouseDown(aimX, aimY);
for (let n = 0; n < 18; n++) {
  await sleep(70);
  scatterEnd = await state();
  maxEmberProjectiles = Math.max(maxEmberProjectiles, scatterEnd.projectileDetails.filter(p => p.owner === 'player' && p.id === 'ember').length);
}
await mouseUp(aimX, aimY);
await sleep(120);

await keyPress('2', 'Digit2', 50);
const hitTriggerTarget = await evaluate(`__ASHFALL_DEBUG__.spawnEnemy('stalker', 34)`);
let hitTriggerEnd = await state();
let sawHitTrigger = false;
aimX = canvasRect.x + canvasRect.w * .78;
await mouseDown(aimX, aimY);
for (let n = 0; n < 22; n++) {
  await sleep(65);
  hitTriggerEnd = await state();
  sawHitTrigger ||= hitTriggerEnd.projectileDetails.some(p => p.owner === 'player' && p.trigger === 'trigger_hit' && p.payload.includes('spark'));
  if (sawHitTrigger) break;
}
await mouseUp(aimX, aimY);
await sleep(120);

await evaluate(`__ASHFALL_DEBUG__.teleport(276,122); __ASHFALL_DEBUG__.setPlayerStat('hp',10000); __ASHFALL_DEBUG__.step(5); true`);
await keyPress('e', 'KeyE', 69, 'e');
const editorOpened = await evaluate(`({visible:!document.querySelector('#wandEditor').classList.contains('hidden'),slotCount:document.querySelectorAll('#wandEditor [data-slot]').length,currentWand:__ASHFALL_DEBUG__.state().currentWand})`);
await click('#wandEditor [data-remove-slot="2"]');
await click('#wandEditor [data-palette-spell="trigger_timer"]');
await click('#wandEditor [data-slot="2"]');
await click('#wandEditor [data-palette-spell="spark"]');
await click('#wandEditor [data-slot="3"]');
const timerEditor = await evaluate(`({
  visible: !document.querySelector('#wandEditor').classList.contains('hidden'),
  slots: __ASHFALL_DEBUG__.state().wandSlots[1],
  slot2: document.querySelector('#wandEditor [data-slot="2"]')?.innerText,
  plan: __ASHFALL_DEBUG__.inspectCast(1)
})`);
await screenshot('/tmp/opencode/ashfall-final-editor.png');
await click('#closeEditor');
const editorClosed = await state();
await evaluate(`__ASHFALL_DEBUG__.step(100); true`);
await evaluate(`(()=>{const D=__ASHFALL_DEBUG__;for(let y=20;y<=350;y++)for(let x=235;x<=245;x++)D.setCell(x,y,'AIR');D.clearEnemies();D.teleport(240,350);D.step(1);})()`);
const beforeTimerCast = await state();
let timerEnd = beforeTimerCast;
let sawTimerShell = false;
let sawReleasedTimerPayload = false;
let timerShellFrames = 0;
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: canvasRect.x + canvasRect.w * .5, y: canvasRect.y + 24 });
const timerCastCount = await evaluate('__ASHFALL_DEBUG__.cast()');
for (let n = 0; n < 170; n++) {
  await evaluate('__ASHFALL_DEBUG__.step(1)');
  timerEnd = await state();
  const shellNow = timerEnd.projectileDetails.some(p => p.owner === 'player' && p.trigger === 'trigger_timer');
  sawTimerShell ||= shellNow;
  if (shellNow) timerShellFrames++;
  if (sawTimerShell) {
    sawReleasedTimerPayload ||= timerEnd.projectileDetails.some(p => p.owner === 'player' && p.id === 'spark' && p.trigger === null);
  }
  if (sawReleasedTimerPayload) break;
}
timerEnd = await state();

await evaluate(`__ASHFALL_DEBUG__.start(); __ASHFALL_DEBUG__.step(8); __ASHFALL_DEBUG__.setPlayerStat('hp',1000000); __ASHFALL_DEBUG__.setPlayerStat('grace',999999); true`);
const enemyBehaviors = {};
for (const type of ['stalker', 'spitter', 'wisp', 'bomber', 'mole']) {
  const offset = type === 'bomber' ? 20 : 45;
  const before = await evaluate(`__ASHFALL_DEBUG__.spawnEnemy(${JSON.stringify(type)}, ${offset})`);
  let sawEnemyProjectile = false;
  let fuseSeen = false;
  let emergedSeen = false;
  let latest = null;
  const xs = [before?.x], ys = [before?.y];
  for (let n = 0; n < 28; n++) {
    await evaluate('__ASHFALL_DEBUG__.step(5)');
    const snapshot = await state();
    const target = snapshot.debugEnemies.find(e => e.type === type);
    if (target) {
      latest = target;
      xs.push(target.x); ys.push(target.y);
      fuseSeen ||= target.fuse >= 0;
      emergedSeen ||= type !== 'mole' || target.burrowed === false;
    }
    sawEnemyProjectile ||= snapshot.projectileDetails.some(p => p.owner === 'enemy');
  }
  enemyBehaviors[type] = {
    spawned: before,
    latest,
    moved: latest ? Math.hypot(latest.x - xs[0], latest.y - ys[0]) >= 1 : false,
    sawEnemyProjectile,
    fuseSeen,
    emergedSeen,
    xRange: Math.max(...xs) - Math.min(...xs),
    yRange: Math.max(...ys) - Math.min(...ys)
  };
}

await evaluate(`__ASHFALL_DEBUG__.start(); __ASHFALL_DEBUG__.teleport(240,3660); __ASHFALL_DEBUG__.setPlayerStat('hp',100000); __ASHFALL_DEBUG__.setPlayerStat('grace',999999); __ASHFALL_DEBUG__.step(20); true`);
await keyPress('3', 'Digit3', 51);
await evaluate(`__ASHFALL_DEBUG__.spawnEnemy('boss',30); __ASHFALL_DEBUG__.step(8); true`);
const bossBefore = await evaluate(`({state:__ASHFALL_DEBUG__.state(),hudVisible:!document.querySelector('#bossHud').classList.contains('hidden'),hudText:document.querySelector('#bossHud').innerText})`);
let bossEnd = await state();
let bossMinHp = bossBefore.state.debugEnemies.find(e => e.type === 'boss')?.hp ?? 0;
const bossAimX = canvasRect.x + canvasRect.w * .65;
const bossAimY = canvasRect.y + canvasRect.h * .5;
await mouseDown(bossAimX, bossAimY);
for (let n = 0; n < 36; n++) {
  await sleep(85);
  bossEnd = await state();
  const target = bossEnd.debugEnemies.find(e => e.type === 'boss');
  if (target) bossMinHp = Math.min(bossMinHp, target.hp);
  if (bossEnd.gameState === 'victory') break;
}
await mouseUp(bossAimX, bossAimY);
await sleep(150);
const boss = {
  before: bossBefore,
  end: bossEnd,
  minHp: bossMinHp,
  victoryVisible: await evaluate(`!document.querySelector('#victory').classList.contains('hidden')`)
};

async function runDeath(expected, setupExpression, steps) {
  await evaluate(`__ASHFALL_DEBUG__.start(); __ASHFALL_DEBUG__.step(5); (${setupExpression}); __ASHFALL_DEBUG__.step(${steps}); true`);
  const result = await evaluate(`({
    state: __ASHFALL_DEBUG__.state(),
    cause: document.querySelector('#deathCause').textContent,
    stats: document.querySelector('#deathStats').textContent,
    visible: !document.querySelector('#death').classList.contains('hidden')
  })`);
  return { expected, ...result, passed: result.cause === expected && result.visible && result.state.player.dead };
}

const deathTests = [];
deathTests.push(await runDeath('烧死', `(()=>{const D=__ASHFALL_DEBUG__,p=D.state().player,x=Math.floor(p.x),y=Math.floor(p.y);D.setPlayerStat('hp',1);D.setPlayerStat('grace',99999);for(let yy=y-7;yy<=y+7;yy++)for(let xx=x-4;xx<=x+4;xx++)D.setCell(xx,yy,'FIRE',120);})()`, 12));
deathTests.push(await runDeath('溺死', `(()=>{const D=__ASHFALL_DEBUG__,p=D.state().player,x=Math.floor(p.x),y=Math.floor(p.y);D.setPlayerStat('hp',3);D.setPlayerStat('breath',0);D.setPlayerStat('hazardTick',17);for(let yy=y-8;yy<=y+7;yy++)for(let xx=x-4;xx<=x+4;xx++)D.setCell(xx,yy,'WATER');})()`, 2));
deathTests.push(await runDeath('毒死', `(()=>{const D=__ASHFALL_DEBUG__;D.setPlayerStat('hp',1);D.setPlayerStat('poison',39);})()`, 1));
deathTests.push(await runDeath('被落石压死', `(()=>{const D=__ASHFALL_DEBUG__;for(let y=5;y<131;y++)for(let x=235;x<=245;x++)D.setCell(x,y,'AIR');for(let x=225;x<=255;x++)D.setCell(x,131,'BRICK');D.teleport(240,25);D.setPlayerStat('hp',1);D.setPlayerStat('vy',0);D.setPlayerStat('grace',99999);})()`, 130));
deathTests.push(await runDeath('被灰烬掠夺者击杀', `(()=>{const D=__ASHFALL_DEBUG__;D.setPlayerStat('hp',3);D.setPlayerStat('grace',0);D.setPlayerStat('inv',0);D.spawnEnemy('stalker',0);})()`, 3));
deathTests.push(await runDeath('酸蚀而死', `(()=>{const D=__ASHFALL_DEBUG__,p=D.state().player,x=Math.floor(p.x),y=Math.floor(p.y);D.setPlayerStat('hp',12);D.setPlayerStat('grace',0);for(let yy=y-7;yy<=y+7;yy++)for(let xx=x-4;xx<=x+4;xx++)D.setCell(xx,yy,'ACID');})()`, 20));
await screenshot('/tmp/opencode/ashfall-final-death.png');
await click('#restartBtn');
await evaluate('__ASHFALL_DEBUG__.step(20)');
const restarted = await state();
const restartUi = await evaluate(`({deathHidden:document.querySelector('#death').classList.contains('hidden'),victoryHidden:document.querySelector('#victory').classList.contains('hidden')})`);

await evaluate(`__ASHFALL_DEBUG__.start(); __ASHFALL_DEBUG__.setPlayerStat('hp',1000000000); __ASHFALL_DEBUG__.setPlayerStat('grace',9999999); true`);
await sleep(2200);
const realTimeFps = await evaluate(`document.querySelector('#fps').textContent`);
const canvasLight = await evaluate(`(()=>{const c=document.querySelector('#game'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let sum=0,bright=0,dark=0;for(let i=0;i<d.length;i+=4){const l=d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;sum+=l;if(l>35)bright++;if(l<8)dark++;}const n=d.length/4;return{averageLuma:sum/n,brightRatio:bright/n,darkRatio:dark/n};})()`);
const benchmark = await evaluate(`(()=>{const D=__ASHFALL_DEBUG__,bench=D.benchmark(120),t0=performance.now(),s=D.step(1800),elapsed=performance.now()-t0;return{bench,elapsed,frame:s.frame};})()`);
const performanceState = await state();
await screenshot('/tmp/opencode/ashfall-final-desktop.png');

const physics = await evaluate('__ASHFALL_DEBUG__.physicsProbe()');

await viewport(390, 844, true);
await send('Page.reload', { ignoreCache: true });
await send('Page.bringToFront');
await waitFor(`document.readyState === 'complete' && !!window.__ASHFALL_DEBUG__`);
await sleep(250);
await click('#startBtn');
await waitFrames(25);
const mobileStarted = await state();
await evaluate(`__ASHFALL_DEBUG__.clearEnemies(); __ASHFALL_DEBUG__.setPlayerStat('hp',1000000); __ASHFALL_DEBUG__.setPlayerStat('grace',999999); __ASHFALL_DEBUG__.step(1); true`);
const mobileLayout = await evaluate(`(()=>{const touch=document.querySelector('#touchControls'),wand=document.querySelector('#wandBar'),right=document.querySelector('#touchRight'),fire=document.querySelector('#touchFire'),canvas=document.querySelector('#game');const tr=touch.getBoundingClientRect(),wr=wand.getBoundingClientRect(),rr=right.getBoundingClientRect(),fr=fire.getBoundingClientRect(),cr=canvas.getBoundingClientRect(),controlsBottom=Math.max(...[...touch.querySelectorAll('button')].map(button=>button.getBoundingClientRect().bottom));return{touchDisplay:getComputedStyle(touch).display,rightRect:{x:rr.x,y:rr.y,w:rr.width,h:rr.height},fireRect:{x:fr.x,y:fr.y,w:fr.width,h:fr.height},touchBottom:tr.bottom,controlsBottom,wandTop:wr.top,noWandOverlap:controlsBottom<=wr.top+1,canvas:{x:cr.x,y:cr.y,w:cr.width,h:cr.height}}})()`);
const mobileBeforeMove = await state();
const mobileRight = mobileLayout.rightRect;
await touchDown(mobileRight.x + mobileRight.w / 2, mobileRight.y + mobileRight.h / 2, 1);
await sleep(420);
const mobileDuringMove = await state();
await touchUp();
const mobileJumpRect = await evaluate(`(()=>{const r=document.querySelector('#touchJump').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()`);
await touchDown(mobileJumpRect.x + mobileJumpRect.w / 2, mobileJumpRect.y + mobileJumpRect.h / 2, 2);
let mobileDuringJump = await state();
let mobileMinJumpY = mobileDuringJump.player.y;
for (let n = 0; n < 6; n++) {
  await sleep(50);
  mobileDuringJump = await state();
  mobileMinJumpY = Math.min(mobileMinJumpY, mobileDuringJump.player.y);
}
await touchUp();
await sleep(380);
await click('#touchWand');
const mobileAfterWand = await state();
const mobileFireRect = mobileLayout.fireRect;
await evaluate(`__ASHFALL_DEBUG__.setPlayerStat('hp',1000000); __ASHFALL_DEBUG__.setPlayerStat('grace',999999); __ASHFALL_DEBUG__.spawnEnemy('stalker',20); true`);
let mobileCombat = await state();
let mobileMaxProjectiles = 0;
await touchDown(mobileFireRect.x + mobileFireRect.w / 2, mobileFireRect.y + mobileFireRect.h / 2, 3);
for (let n = 0; n < 50; n++) {
  await sleep(100);
  mobileCombat = await state();
  mobileMaxProjectiles = Math.max(mobileMaxProjectiles, mobileCombat.projectiles);
  if (mobileCombat.kills > mobileStarted.kills) break;
}
await touchUp();
await evaluate(`__ASHFALL_DEBUG__.teleport(276,122); __ASHFALL_DEBUG__.step(1); true`);
await click('#touchEdit');
const mobileEditor = await evaluate(`!document.querySelector('#wandEditor').classList.contains('hidden')`);
await click('#closeEditor');
await sleep(180);
await screenshot('/tmp/opencode/ashfall-final-mobile.png');

const input = {
  beforeMove: { x: beforeMove.player.x, y: beforeMove.player.y },
  duringMove: { x: duringMove.player.x, y: duringMove.player.y, inputKeys: duringMove.inputKeys },
  movedRight: duringMove.player.x > beforeMove.player.x + 1,
  duringJump: { x: duringJump.player.x, y: duringJump.player.y, inputKeys: duringJump.inputKeys },
  jumped: duringJump.player.y < beforeJump.player.y - 1,
  afterJump: { x: afterJump.player.x, y: afterJump.player.y },
  switched: { digit2: afterDigit2.currentWand, q: afterQ.currentWand, digit1: afterDigit1.currentWand },
  trusted: trustedKeys.length > 0 && trustedKeys.every(event => event.trusted)
};
const combat = {
  target: spawnCombatTarget,
  startKills: combatStart.kills,
  endKills: combatEnd.kills,
  minTargetHp,
  combatSawDamage,
  maxProjectiles: maxCombatProjectiles,
  killedEnemy: combatEnd.kills > combatStart.kills
};
const editor = { opened: editorOpened, timer: timerEditor, closed: editorClosed };
const triggers = { sawHitTrigger, sawTimerShell, sawReleasedTimerPayload, timerShellFrames, timerCastCount };
const mobile = {
  started: mobileStarted,
  layout: mobileLayout,
  beforeX: mobileBeforeMove.player.x,
  duringX: mobileDuringMove.player.x,
  beforeJumpY: mobileDuringMove.player.y,
  duringJumpY: mobileDuringJump.player.y,
  minJumpY: mobileMinJumpY,
  duringMovePlayer: mobileDuringMove.player,
  duringJumpPlayer: mobileDuringJump.player,
  movedRight: mobileDuringMove.player.x > mobileBeforeMove.player.x + 1,
  jumpRose: mobileMinJumpY < mobileDuringMove.player.y - 1,
  combatKills: mobileCombat.kills - mobileStarted.kills,
  maxProjectiles: mobileMaxProjectiles,
  switchedWand: mobileAfterWand.currentWand !== mobileStarted.currentWand,
  editorOpened: mobileEditor
};
const checks = {
  domTitle: dom.title === '烬隙 / ASHFALL',
  noExternalAssets: dom.externalAssets.length === 0,
  materialFloor: started.materials >= 20,
  fiveEnemyTypes: ['stalker', 'spitter', 'wisp', 'bomber', 'mole'].every(type => started.enemyTypes.includes(type)),
  trustedMovement: input.movedRight && input.jumped && input.trusted,
  wandHotkeys: input.switched.digit2 === 1 && input.switched.q === 2 && input.switched.digit1 === 0,
  realCombatKill: combat.killedEnemy && combat.combatSawDamage,
  modifierScatter: maxEmberProjectiles >= 2,
  editorRealInput: editor.opened.visible && editor.opened.slotCount === 6,
  editorTimerConfig: editor.timer.plan?.shots?.[0]?.trigger === 'trigger_timer' && editor.timer.plan.shots[0].payload.some(p => p.id === 'spark'),
  triggerHitRuntime: sawHitTrigger,
  triggerTimerRuntime: sawTimerShell && sawReleasedTimerPayload,
  enemyStalker: enemyBehaviors.stalker.moved,
  enemySpitter: enemyBehaviors.spitter.sawEnemyProjectile,
  enemyWisp: enemyBehaviors.wisp.moved,
  enemyBomber: enemyBehaviors.bomber.fuseSeen,
  enemyMole: enemyBehaviors.mole.emergedSeen,
  bossHud: bossBefore.hudVisible,
  bossVictory: boss.victoryVisible && boss.end.gameState === 'victory',
  deathCauses: deathTests.every(test => test.passed),
  restart: restarted.player.hp === 100 && restarted.kills === 0 && restarted.gold === 0 && restartUi.deathHidden && restartUi.victoryHidden,
  desktopLighting: canvasLight.brightRatio > .08 && canvasLight.averageLuma < 90 && canvasLight.darkRatio > .01,
  performance: benchmark.bench.updateEach < 50 && benchmark.bench.drawEach < 50 && benchmark.frame - started.frame >= 1800,
  physicsRules: ['oilAboveWater', 'bloodSank', 'lavaWaterSteamStone', 'acidCorroded', 'fireSpread', 'waterExtinguished', 'toxicGasRose'].every(key => physics[key] === true),
  mobileLayout: mobileLayout.touchDisplay !== 'none' && mobileLayout.noWandOverlap,
  mobileMovement: mobile.movedRight && mobile.jumpRose,
  mobileCombat: mobile.combatKills > 0 && mobile.maxProjectiles > 0,
  mobileWandEditor: mobile.switchedWand && mobile.editorOpened,
  noConsoleErrors: errors.length === 0
};

const result = {
  recordedAt: new Date().toISOString(),
  dom,
  started: { state: started.state, seed: started.seed, frame: started.frame, seconds: started.seconds, player: started.player, zone: started.zone, depth: started.depth, enemies: started.enemies, enemyTypes: started.enemyTypes, materials: started.materials },
  input,
  castPlans,
  combat,
  scatter: { maxEmberProjectiles, target: scatterTarget },
  hitTriggerTarget,
  editor,
  triggers,
  enemyBehaviors,
  boss,
  deathTests,
  restarted,
  restartUi,
  performance: { realTimeFps, canvasLight, benchmark, finalFrame: performanceState.frame, state: performanceState },
  physics,
  mobile,
  checks,
  errors,
  consoleCount: consoleMessages.length
};
fs.writeFileSync('/tmp/opencode/ashfall-final-e2e.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ checks, summary: { combat, triggers, boss: { minHp: boss.minHp, gameState: boss.end.gameState, victoryVisible: boss.victoryVisible }, deathTests: deathTests.map(t => ({ expected: t.expected, actual: t.cause, passed: t.passed })), performance: result.performance, mobile, errors, consoleCount: consoleMessages.length } }, null, 2));
if (Object.values(checks).some(value => !value)) process.exitCode = 1;
await send('Page.close');
ws.close();
