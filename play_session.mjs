#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

class FakeEl {
  constructor(id) {
    this.id = id; this.style = {}; this.innerHTML = ''; this.textContent = ''; this.className = '';
    this.classList = { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } };
  }
  addEventListener() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 384, height: 216 }; }
}
const els = {};
const getEl = id => (els[id] ||= new FakeEl(id));
const canvasEl = getEl('game');
canvasEl.width = 384; canvasEl.height = 216;
canvasEl.getContext = () => ({
  imageSmoothingEnabled: false,
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
  putImageData() {}
});
const windowObj = {
  document: { readyState: 'complete', getElementById: getEl, addEventListener() {} },
  addEventListener() {}, __EW_NO_AUTOSTART: true
};
windowObj.window = windowObj;
const sandbox = {
  window: windowObj, document: windowObj.document, globalThis: windowObj, global: windowObj,
  console, Math, Date, Uint8Array, Uint8ClampedArray, Float32Array, Array, Object, JSON
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8'), sandbox, { filename: 'game.js' });
const EW = sandbox.window.EMBERWELL;

const t0 = Date.now();
EW.start(777001);
const spawn = EW.getState();
console.log('spawn', spawn.player);

// walk, jump, hover, shoot for ~8 seconds of sim (480 frames)
EW.setKey('d', true);
EW.setPointer(spawn.player.x + 60, 50, true);
let maxKills = 0, maxDepth = 0, casts = 0;
for (let i = 0; i < 240; i++) {
  if (i === 30) EW.setKey('w', true);
  if (i === 50) EW.setKey('w', false);
  if (i === 80) { EW.setKey('d', false); EW.setKey('a', true); }
  if (i === 140) { EW.setKey('a', false); EW.setKey('d', true); }
  EW.tick(1);
  const st = EW.getState();
  maxKills = Math.max(maxKills, st.run.kills);
  maxDepth = Math.max(maxDepth, st.run.depth);
  casts = st.run.casts;
  if (st.player.dead) break;
}
EW.setKey('d', false);
EW.setPointer(0, 0, false);
EW.draw();
const mid = EW.getState();
const light = EW.lightAt(Math.min(383, Math.max(0, mid.player.x | 0)), Math.min(215, Math.max(0, (mid.player.y - mid.camY) | 0)));

// force a burn death to confirm panel
if (!mid.player.dead) {
  const pl = EW.getPlayer();
  pl.hp = 3; pl.inv = 0; pl.wet = 0;
  const M = EW.MAT;
  for (let dy = -3; dy <= 4; dy++) for (let dx = -3; dx <= 3; dx++) EW.setMat(pl.x + dx, pl.y + dy, M.FIRE, 90);
  EW.tick(120);
}
const end = EW.getState();
const dt = Date.now() - t0;
const report = {
  simFrames: end.run.frames,
  wallMs: dt,
  spawn: { x: spawn.player.x, y: spawn.player.y, hp: spawn.player.hp },
  walked: true,
  jumped: true,
  casts,
  kills: end.run.kills,
  maxDepth: end.run.depth | 0,
  lightNear: light,
  dead: !!(end.player && end.player.dead),
  gameState: end.gameState,
  cause: end.run.cause,
  deadReason: getEl('deadReason').textContent,
  causePanel: getEl('cause').textContent,
  runStats: getEl('runStats').textContent
};
fs.writeFileSync(path.join(__dirname, 'play-session.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(end.player.dead && /烧/.test(report.causePanel || report.cause.msg) ? 'DEATH PANEL OK' : 'death panel missing');
