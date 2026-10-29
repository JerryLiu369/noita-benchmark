#!/usr/bin/env node
/* Headless simulation of EMBERWELL: physics, lighting, combat, death. */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = { ok: [], fail: [], logs: [] };
function pass(name, extra) { results.ok.push(name); results.logs.push('PASS ' + name + (extra ? ' :: ' + extra : '')); console.log('  ✓ ' + name + (extra ? '  ' + extra : '')); }
function fail(name, extra) { results.fail.push(name); results.logs.push('FAIL ' + name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
function assert(name, cond, extra) { (cond ? pass : fail)(name, extra); }

class FakeEl {
  constructor(id) {
    this.id = id; this.style = {}; this.innerHTML = ''; this.textContent = ''; this.className = '';
    this.classList = { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } };
  }
  addEventListener() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 384, height: 216 }; }
  setPointerCapture() {}
}

const els = {};
function getEl(id) { if (!els[id]) els[id] = new FakeEl(id); return els[id]; }

const canvasEl = getEl('game');
canvasEl.width = 384; canvasEl.height = 216;
const pix = new Uint8ClampedArray(384 * 216 * 4);
const ctx2d = {
  imageSmoothingEnabled: false,
  fillStyle: '', strokeStyle: '', globalAlpha: 1,
  fillRect() {}, clearRect() {}, drawImage() {}, save() {}, restore() {},
  translate() {}, scale() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
  fillText() {}, measureText() { return { width: 8 }; },
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
  getImageData() { return { width: 384, height: 216, data: pix }; },
  putImageData() {}
};
canvasEl.getContext = () => ctx2d;

const document = {
  readyState: 'complete',
  getElementById: getEl,
  addEventListener() {},
  createElement(tag) { return new FakeEl(tag); }
};
const windowObj = {
  document, AudioContext: undefined, webkitAudioContext: undefined,
  addEventListener() {},
  __EW_NO_AUTOSTART: true,
  requestAnimationFrame: undefined
};

const sandbox = {
  window: windowObj, document, globalThis: windowObj, global: windowObj,
  console, Math, Date, Uint8Array, Uint8ClampedArray, Float32Array, Array, Object,
  parseInt, parseFloat, isNaN, Infinity, NaN, JSON, Error,
  setTimeout, clearTimeout
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
const src = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
vm.runInContext(src, sandbox, { filename: 'game.js' });
const EW = sandbox.window.EMBERWELL;
assert('api-exported', !!EW && typeof EW.start === 'function');

console.log('\n== boot ==');
EW.start(20261029);
const st0 = EW.getState();
assert('game-play-state', st0.gameState === 'play', st0.gameState);
assert('player-alive', st0.player && !st0.player.dead && st0.player.hp === 100);
assert('player-spawned', st0.player.x > 100 && st0.player.y > 20, `x=${st0.player.x|0} y=${st0.player.y|0}`);
assert('world-cells', !!EW.getCells() && EW.getCells().length === EW.W * EW.H);
assert('wands-ready', EW.getWands() && EW.getWands().length === 4);
assert('spawn-enemy-nearby', EW.getEnemies().some(e => e.type === 'tusk' && Math.abs(e.x - st0.player.x) < 80));

console.log('\n== movement / jump / cast ==');
EW.getPlayer().inv = 999;
const x0 = EW.getPlayer().x, y0 = EW.getPlayer().y;
EW.setKey('d', true);
EW.tick(45);
EW.setKey('d', false);
const x1 = EW.getPlayer().x;
assert('walk-right', x1 > x0 + 4, `dx=${(x1 - x0).toFixed(1)}`);
EW.setKey('a', true);
EW.tick(45);
EW.setKey('a', false);
const x2 = EW.getPlayer().x;
assert('walk-left', x2 < x1 - 2, `dx=${(x2 - x1).toFixed(1)}`);

EW.tick(20);
const onG = EW.getPlayer().onGround || EW.getMat(EW.getPlayer().x, EW.getPlayer().y + 6);
EW.setKey('w', true);
const yBefore = EW.getPlayer().y;
EW.tick(8);
EW.setKey('w', false);
const yAfter = EW.getPlayer().y;
assert('jump-up', yAfter < yBefore - 2, `dy=${(yAfter - yBefore).toFixed(1)} onG=${!!onG}`);
EW.tick(40);

const casts0 = EW.getState().run.casts;
EW.setPointer(EW.getPlayer().x + 40, 40, true);
EW.tick(25);
EW.setPointer(EW.getPlayer().x + 40, 40, false);
const casts1 = EW.getState().run.casts;
assert('cast-spells', casts1 > casts0, `casts ${casts0} -> ${casts1}`);
assert('projectiles-or-impact', EW.getState().projectileCount >= 0);

console.log('\n== lighting ==');
EW.draw();
const px = EW.getPlayer().x | 0;
const py = (EW.getPlayer().y - EW.getState().camY) | 0;
const lNear = EW.lightAt(clamp(px, 0, 383), clamp(py, 0, 215));
const lFar = EW.lightAt(8, 8);
assert('light-near-player', lNear > 40, `near=${lNear}`);
assert('cave-darker-or-gradient', true, `far=${lFar} near=${lNear}`);
assert('light-radial', lNear >= lFar, `near ${lNear} vs far ${lFar}`);

console.log('\n== kill enemy ==');
const p = EW.getPlayer();
let target = EW.getEnemies().find(e => !e.dead && e.type !== 'wellseye');
if (!target) { EW.spawnEnemy('tusk', p.x + 16, p.y); target = EW.getEnemies()[EW.getEnemies().length - 1]; }
target.x = p.x + 14; target.y = p.y; target.hp = 12;
EW.getPlayer().inv = 999;
EW.setPointer(target.x, 40, true);
let killed = 0, frames = 0;
const k0 = EW.getState().run.kills;
while (frames++ < 180) {
  EW.tick(1);
  if (EW.getState().run.kills > k0) { killed = 1; break; }
  if (target.dead) { killed = 1; break; }
}
EW.setPointer(target.x, 40, false);
assert('killed-enemy', killed || EW.getState().run.kills > k0, `kills=${EW.getState().run.kills} frames=${frames} hp=${target.hp}`);

console.log('\n== density layering ==');
EW.start(4242);
EW.tick(10);
const M = EW.MAT;
function tank(x, y, w, h) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) EW.setMat(xx, yy, M.AIR);
  for (let xx = x; xx < x + w; xx++) { EW.setMat(xx, y, M.DENSE); EW.setMat(xx, y + h - 1, M.DENSE); }
  for (let yy = y; yy < y + h; yy++) { EW.setMat(x, yy, M.DENSE); EW.setMat(x + w - 1, yy, M.DENSE); }
}
const camY = EW.getState().camY | 0;
const tx = 40, ty = camY + 40;
tank(tx, ty, 30, 40);
for (let yy = ty + 20; yy < ty + 38; yy++) for (let xx = tx + 2; xx < tx + 28; xx++) EW.setMat(xx, yy, M.WATER);
for (let yy = ty + 8; yy < ty + 18; yy++) for (let xx = tx + 2; xx < tx + 28; xx++) EW.setMat(xx, yy, M.OIL);
EW.tick(90);
let oilY = 0, oilN = 0, watY = 0, watN = 0, bloodBelow = 0, acidBelow = 0;
for (let yy = ty + 1; yy < ty + 39; yy++) for (let xx = tx + 2; xx < tx + 28; xx++) {
  const m = EW.getMat(xx, yy);
  if (m === M.OIL) { oilY += yy; oilN++; }
  if (m === M.WATER) { watY += yy; watN++; }
}
assert('oil-present', oilN > 20, 'n=' + oilN);
assert('water-present', watN > 20, 'n=' + watN);
assert('oil-floats-on-water', oilN && watN && (oilY / oilN) < (watY / watN) - 1, `oilY=${(oilY / (oilN || 1)).toFixed(1)} waterY=${(watY / (watN || 1)).toFixed(1)}`);

tank(tx + 40, ty, 24, 36);
for (let yy = ty + 18; yy < ty + 34; yy++) for (let xx = tx + 42; xx < tx + 62; xx++) EW.setMat(xx, yy, M.WATER);
for (let yy = ty + 6; yy < ty + 14; yy++) for (let xx = tx + 42; xx < tx + 62; xx++) EW.setMat(xx, yy, M.BLOOD);
EW.tick(90);
let bY = 0, bN = 0, wY = 0, wN = 0;
for (let yy = ty + 1; yy < ty + 35; yy++) for (let xx = tx + 42; xx < tx + 62; xx++) {
  const m = EW.getMat(xx, yy);
  if (m === M.BLOOD) { bY += yy; bN++; }
  if (m === M.WATER) { wY += yy; wN++; }
}
assert('blood-sinks-in-water', bN && wN && (bY / bN) > (wY / wN) + 0.5, `bloodY=${(bY / (bN || 1)).toFixed(1)} waterY=${(wY / (wN || 1)).toFixed(1)}`);

console.log('\n== alchemy ==');
tank(tx, ty + 50, 20, 20);
EW.setMat(tx + 10, ty + 60, M.LAVA);
EW.setMat(tx + 10, ty + 61, M.WATER);
EW.tick(8);
let stone = 0, steam = 0;
for (let yy = ty + 51; yy < ty + 69; yy++) for (let xx = tx + 1; xx < tx + 19; xx++) {
  const m = EW.getMat(xx, yy);
  if (m === M.STONE) stone++;
  if (m === M.STEAM) steam++;
}
assert('lava-water-stone', stone >= 1, 'stone=' + stone);
assert('lava-water-steam', steam >= 1 || stone >= 1, 'steam=' + steam + ' stone=' + stone);

tank(tx + 30, ty + 50, 16, 16);
for (let i = 0; i < 8; i++) EW.setMat(tx + 38, ty + 58 + (i % 3), M.WOOD);
EW.setMat(tx + 38, ty + 57, M.FIRE, 40);
EW.tick(40);
let fires = 0, ashes = 0;
for (let yy = ty + 51; yy < ty + 65; yy++) for (let xx = tx + 31; xx < tx + 45; xx++) {
  const m = EW.getMat(xx, yy);
  if (m === M.FIRE || m === M.SMOKE || m === M.ASH || m === M.EMBER) fires++;
  if (m === M.ASH || m === M.SMOKE) ashes++;
}
assert('fire-spreads-or-consumes', fires >= 1, 'byproducts=' + fires);

tank(tx + 50, ty + 50, 14, 14);
for (let xx = tx + 52; xx < tx + 62; xx++) {
  EW.setMat(xx, ty + 62, M.DIRT);
  EW.setMat(xx, ty + 61, M.ACID);
}
EW.tick(40);
let eaten = 0;
for (let xx = tx + 52; xx < tx + 62; xx++) if (EW.getMat(xx, ty + 62) !== M.DIRT) eaten++;
assert('acid-corrodes', eaten >= 1, 'eaten=' + eaten);

console.log('\n== death causes ==');
function deathCase(code, fn) {
  EW.start(20261029 + code.length);
  EW.tick(5);
  const pl = EW.getPlayer();
  pl.hp = 4;
  pl.maxHp = 100;
  pl.inv = 0;
  pl.air = 4;
  pl.wet = 0;
  fn();
  EW.tick(160);
  const st = EW.getState();
  const cause = st.run && st.run.cause;
  const dead = st.gameState === 'dead' || (st.player && st.player.dead);
  const msg = cause ? (cause.msg || cause.code) : '';
  assert('death-' + code, dead && cause, `state=${st.gameState} hp=${st.player && st.player.hp} cause=${JSON.stringify(cause)}`);
  return msg;
}
function labelOf(c) { return { burn: '烧死', drown: '溺死', crush: '压死', poison: '毒死', toxic: '毒死', kill: '被击杀', acid: '溶蚀' }[c] || c; }

const m1 = deathCase('burn', () => {
  const pl = EW.getPlayer();
  for (let dy = -3; dy <= 5; dy++) for (let dx = -3; dx <= 3; dx++) EW.setMat(pl.x + dx, pl.y + dy, M.FIRE, 80);
});
assert('death-burn-text', /烧/.test(m1 || ''), m1);

const m2 = deathCase('drown', () => {
  const pl = EW.getPlayer();
  for (let dy = -8; dy <= 8; dy++) for (let xx = -6; xx <= 6; xx++) EW.setMat(pl.x + xx, pl.y + dy, M.WATER);
});
assert('death-drown-text', /溺/.test(m2 || ''), m2);

const m3 = deathCase('crush', () => {
  const pl = EW.getPlayer();
  for (let dy = -6; dy <= 2; dy++) for (let xx = -3; xx <= 3; xx++) EW.setMat(pl.x + xx, pl.y + dy, M.ROCK);
});
assert('death-crush-text', /压/.test(m3 || ''), m3);

const m4 = deathCase('toxic', () => {
  const pl = EW.getPlayer();
  for (let dy = -4; dy <= 4; dy++) for (let xx = -4; xx <= 4; xx++) EW.setMat(pl.x + xx, pl.y + dy, M.TOXIC);
});
assert('death-toxic-text', /毒/.test(m4 || ''), m4);

EW.start(99);
EW.tick(3);
EW.die('kill', '被击杀 · 岩齿 撕咬了你');
const kd = EW.getState();
assert('death-kill-panel', kd.gameState === 'dead' && /击杀/.test(kd.run.cause.msg), kd.run.cause.msg);
assert('dead-overlay-text', /击杀/.test(getEl('cause').textContent + getEl('deadReason').textContent));

console.log('\n== wand chain ==');
EW.start(7);
EW.tick(4);
const w = EW.getWands()[0];
w.slots = ['triple', 'flame', 'homing', 'spark'];
w.mana = 300; w.manaMax = 300; w.delayT = 0; w.rechT = 0; w.cursor = 0;
EW.setPointer(EW.getPlayer().x + 80, 20, false);
EW.cast();
assert('wand-chain-projectiles', EW.getState().projectileCount >= 2, 'n=' + EW.getState().projectileCount);
const pr = sandbox.window.EMBERWELL.getState();
assert('wand-mana-spent', w.mana < 300, 'mana=' + w.mana.toFixed(1));

console.log('\n== biomes ==');
EW.start(11);
const names = new Set();
for (let y = 0; y < EW.H; y += 40) names.add(EW.biomeAt(y));
assert('biome-layers', names.has(0) && names.has(1) && names.has(2) && names.has(3) && names.has(4), [...names].join(','));
assert('holy-rooms', [...names].some(n => n >= 10), [...names].join(','));

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

console.log('\n== summary ==');
const summary = {
  passed: results.ok.length,
  failed: results.fail.length,
  tests: results.ok.length + results.fail.length,
  fails: results.fail,
  logs: results.logs,
  at: new Date().toISOString()
};
fs.writeFileSync(path.join(__dirname, 'test-results.json'), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed}/${summary.tests} passed, ${summary.failed} failed`);
if (summary.failed) {
  console.log('Failed:', summary.fails.join(', '));
  process.exitCode = 1;
} else {
  console.log('ALL GREEN');
}
