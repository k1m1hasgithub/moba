// Lanefall: player controls. Keyboard + mouse, and touch (joystick + drag-to-aim skill buttons).
// Produces one input state that is either applied to the local hero or sent to the host.
'use strict';
(function (LF) {
const D = LF.data;
const KEY_TO_SKILL = { q: 's1', '1': 's1', e: 's2', '2': 's2', r: 'ult', '3': 'ult', f: 'sp', '4': 'sp' };

const S = {
  enabled: false, view: null,
  keys: new Set(), mouse: { x: 0, y: 0, inside: false },
  joy: null, attackKey: false, attackBtn: false,
  aim: null,               // { key, src: 'key'|'touch', x, y } world point while aiming
  casts: [], netCasts: [], castSeq: 0,
  moveTo: null, moveSeq: 0, moveDirty: false, steer: false,
  target: null, targetSeq: 0, targetDirty: false,
  recallSeq: 0, recallDirty: false,
  click: null,
  build: null,              // the player's own build for this match (item ids), null = recommended
  shop: [], netShop: [], shopSeq: 0, autoBuy: (() => { try { return localStorage.getItem('lf-autobuy') === '1'; } catch (e) { return false; } })(),
};
let canvas, ui = {};

function init(c) {
  canvas = c;
  ui.joyZone = document.getElementById('joyZone');
  ui.joyBase = document.getElementById('joyBase');
  ui.joyKnob = document.getElementById('joyKnob');
  ui.attack = document.getElementById('btnAttack');
  ui.recall = document.getElementById('btnRecall');
  ui.skills = { s1: document.getElementById('sk-s1'), s2: document.getElementById('sk-s2'), ult: document.getElementById('sk-ult'), sp: document.getElementById('sk-sp'), rg: document.getElementById('btnRegen') };
  ui.minimap = document.getElementById('minimap');

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { S.keys.clear(); S.attackKey = false; S.aim = null; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', onCanvasDown);
  canvas.addEventListener('pointermove', onCanvasMove);
  canvas.addEventListener('pointerup', () => { S.steer = false; });
  canvas.addEventListener('pointercancel', () => { S.steer = false; });
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') S.mouse.inside = false; });

  // Joystick: appears where the thumb lands inside the left zone.
  ui.joyZone.addEventListener('pointerdown', e => {
    if (!S.enabled) return;
    e.preventDefault();
    ui.joyZone.setPointerCapture(e.pointerId);
    const r = ui.joyZone.getBoundingClientRect();
    S.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    ui.joyBase.style.left = (e.clientX - r.left) + 'px';
    ui.joyBase.style.bottom = (r.bottom - e.clientY) + 'px';
    ui.joyKnob.style.transform = '';
  });
  ui.joyZone.addEventListener('pointermove', e => {
    if (!S.joy || e.pointerId !== S.joy.id) return;
    let dx = e.clientX - S.joy.ox, dy = e.clientY - S.joy.oy;
    const d = Math.hypot(dx, dy), max = 56;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    S.joy.x = dx / max; S.joy.y = dy / max;
    ui.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const joyEnd = e => {
    if (!S.joy || e.pointerId !== S.joy.id) return;
    S.joy = null;
    ui.joyKnob.style.transform = '';
    ui.joyBase.style.left = ''; ui.joyBase.style.bottom = '';
  };
  ui.joyZone.addEventListener('pointerup', joyEnd);
  ui.joyZone.addEventListener('pointercancel', joyEnd);

  ui.attack.addEventListener('pointerdown', e => { e.preventDefault(); if (!S.enabled) return; S.attackBtn = true; ui.attack.classList.add('held'); ui.attack.setPointerCapture(e.pointerId); });
  const atkEnd = () => { S.attackBtn = false; ui.attack.classList.remove('held'); };
  ui.attack.addEventListener('pointerup', atkEnd);
  ui.attack.addEventListener('pointercancel', atkEnd);
  ui.recall.addEventListener('click', () => recall());
  ui.skills.rg.addEventListener('click', () => regen());

  for (const key of ['s1', 's2', 'ult', 'sp']) bindSkillButton(key, ui.skills[key]);

  ui.minimap.addEventListener('pointerdown', e => {
    if (!S.enabled) return;
    e.preventDefault();
    const r = ui.minimap.getBoundingClientRect();
    const w = LF.render.minimapToWorld(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    order(w.x, w.y, true, false);
  });
}

function typing(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

function onKeyDown(e) {
  if (typing(e) || !S.enabled) return;
  const k = e.key.toLowerCase();
  if (k === 'tab') { e.preventDefault(); if (LF.ui) LF.ui.showScore(true); return; }
  if (e.repeat) return;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { S.keys.add(k); e.preventDefault(); return; }
  if (k === ' ' || k === 'j') { S.attackKey = true; e.preventDefault(); return; }
  if (k === 'b') { recall(); return; }
  if (k === 'h') { regen(); return; }
  if (k === 'p') { if (LF.ui) LF.ui.toggleShop(); return; }
  const sk = KEY_TO_SKILL[k];
  if (sk && !aimed(sk)) { const p = autoAim(sk); cast(sk, p.x, p.y); e.preventDefault(); return; }
  if (sk) { S.aim = { key: sk, src: 'key' }; ui.skills[sk].classList.add('aiming'); e.preventDefault(); }
}
function onKeyUp(e) {
  const k = e.key.toLowerCase();
  if (k === 'tab') { if (LF.ui) LF.ui.showScore(false); return; }
  S.keys.delete(k);
  if (k === ' ' || k === 'j') S.attackKey = false;
  const sk = KEY_TO_SKILL[k];
  if (sk && S.aim && S.aim.key === sk && S.aim.src === 'key') {
    ui.skills[sk].classList.remove('aiming');
    const p = S.mouse.inside ? LF.render.screenToWorld(S.mouse.x, S.mouse.y) : autoAim(sk);
    S.aim = null;
    if (S.enabled) cast(sk, p.x, p.y);
  }
}

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function onCanvasDown(e) {
  const p = canvasPos(e);
  S.mouse.x = p.x; S.mouse.y = p.y; S.mouse.inside = e.pointerType === 'mouse';
  if (!S.enabled) return;
  if (S.aim && e.button === 2) { ui.skills[S.aim.key].classList.remove('aiming'); S.aim = null; return; }
  if (S.aim && S.aim.src === 'key' && e.button === 0) {
    const k = S.aim.key; ui.skills[k].classList.remove('aiming'); S.aim = null;
    const w = LF.render.screenToWorld(p.x, p.y);
    cast(k, w.x, w.y);
    return;
  }
  if (e.button !== 0 && e.button !== 2) return;
  if (e.pointerType !== 'mouse') return; // touch players use the joystick
  const w = LF.render.screenToWorld(p.x, p.y);
  canvas.setPointerCapture(e.pointerId);
  S.steer = order(w.x, w.y, true, true) === 'move';
}
function onCanvasMove(e) {
  const p = canvasPos(e);
  S.mouse.x = p.x; S.mouse.y = p.y;
  if (e.pointerType === 'mouse') S.mouse.inside = true;
  if (S.steer && S.enabled) {
    const w = LF.render.screenToWorld(p.x, p.y);
    S.moveTo = { x: w.x, y: w.y }; S.moveDirty = true; S.moveSeq++;
  }
}

// Click on the ground moves; click on an enemy attacks it.
function order(x, y, click, allowTarget) {
  const v = S.view;
  if (!v || !v.player || v.player.dead) return null;
  if (allowTarget) {
    const t = pickAt(x, y);
    if (t) { S.target = t; S.targetSeq++; S.targetDirty = true; S.moveTo = null; return 'target'; }
  }
  S.moveTo = { x: Math.max(40, Math.min(D.W - 40, x)), y: Math.max(40, Math.min(D.H - 40, y)) };
  S.moveSeq++; S.moveDirty = true;
  S.target = null;
  if (click) S.click = { x: S.moveTo.x, y: S.moveTo.y, t: performance.now() / 1000 };
  return 'move';
}

function pickAt(x, y) {
  const v = S.view, me = v.player;
  let best = null, bd = Infinity;
  const tol = 14 / LF.render.scale;
  const consider = (u, oy, rr) => {
    if (!u || u.dead || u.team === me.team) return;
    const d = Math.hypot(u.x - x, u.y - oy - y) - rr - tol;
    if (d <= 0 && d < bd) { bd = d; best = u; }
  };
  for (const h of v.heroes) if (!(h.hidden && h.hidden[me.team])) consider(h, 34, 34);
  for (const m of v.minions) consider(m, 14, m.r + 6);
  for (const m of v.monsters) consider(m, m.mtype === 'wyrm' ? 110 : 24, m.r + (m.mtype === 'wyrm' ? 60 : 8));
  for (const s of v.structs) if (!s.guarded && !(LF.sim.G && v === LF.sim.G && !LF.sim.isTargetable(s))) consider(s, 50, s.r + 30);
  return best;
}

function hoverTarget() {
  if (!S.mouse.inside || !S.view || !S.view.player) return null;
  const w = LF.render.screenToWorld(S.mouse.x, S.mouse.y);
  return pickAt(w.x, w.y);
}

function bindSkillButton(key, el) {
  let st = null;
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!S.enabled) return;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    st = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, drag: false, mouse: e.pointerType === 'mouse' };
    el.classList.add('aiming');
  });
  el.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.cx, dy = e.clientY - st.cy;
    const d = Math.hypot(dx, dy);
    if (d > 16) st.drag = true;
    if (!st.drag) return;
    const h = S.view && S.view.player;
    if (!h) return;
    const sk = LF.sim.skillDef(h, key);
    const dir = LF.render.dirToWorld(dx / (d || 1), dy / (d || 1));
    const reach = (sk.range || sk.radius || 300) * Math.min(1, d / 110);
    S.aim = { key, src: 'touch', x: h.x + dir.x * Math.max(reach, 40), y: h.y + dir.y * Math.max(reach, 40) };
  });
  const end = e => {
    if (!st || e.pointerId !== st.id) return;
    el.classList.remove('aiming');
    const dx = e.clientX - st.cx, dy = e.clientY - st.cy;
    const wasDrag = st.drag;
    st = null;
    if (e.type === 'pointercancel') { S.aim = null; return; }
    if (wasDrag) {
      const a = S.aim;
      S.aim = null;
      if (a && Math.hypot(dx, dy) > 12) cast(key, a.x, a.y);
      return;
    }
    S.aim = null;
    const p = autoAim(key);
    cast(key, p.x, p.y);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// Does this key aim (hold to aim, release to cast)? Self-cast spells and Regen fire on press.
function aimed(key) {
  const h = S.view && S.view.player;
  return !!h && LF.sim.skillDef(h, key).type !== 'buff';
}
// Tap-to-cast: aim at the best enemy for this skill.
function autoAim(key) {
  const v = S.view, h = v.player;
  if (key === 'sp' && h.spell === 'smite') {
    let best = null, bd = Infinity;
    for (const m of v.monsters.concat(v.minions)) {
      if (m.dead || m.team === h.team) continue;
      const d = Math.hypot(m.x - h.x, m.y - h.y) - (m.kind === 'monster' ? 200 : 0);
      if (d < bd) { bd = d; best = m; }
    }
    return best ? { x: best.x, y: best.y } : { x: h.x, y: h.y };
  }
  if (key === 'sp' && h.spell === 'reap') {
    let best = null, bd = Infinity;
    for (const e of v.heroes) {
      if (e.dead || e.team === h.team || (e.hidden && e.hidden[h.team])) continue;
      const d = Math.hypot(e.x - h.x, e.y - h.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { x: best.x, y: best.y } : { x: h.x, y: h.y };
  }
  const sk = LF.sim.skillDef(h, key);
  if (sk.type === 'nova' || sk.type === 'buff' || (sk.type === 'zone' && sk.follow)) return { x: h.x, y: h.y };
  if (sk.ai === 'heal' && sk.type === 'zone') {
    let low = null;
    for (const a of v.heroes) if (!a.dead && a.team === h.team && Math.hypot(a.x - h.x, a.y - h.y) < sk.range + 100 && (!low || a.hp / a.maxHp < low.hp / low.maxHp)) low = a;
    if (low) return { x: low.x, y: low.y };
  }
  const range = (sk.range || 400) + (sk.radius || 0) * 0.5 + 60;
  let best = null, bs = Infinity;
  const consider = (u, bonus) => {
    if (!u || u.dead || u.team === h.team) return;
    const d = Math.hypot(u.x - h.x, u.y - h.y);
    if (d > range) return;
    const s = d - bonus;
    if (s < bs) { bs = s; best = u; }
  };
  for (const e of v.heroes) if (!(e.hidden && e.hidden[h.team])) consider(e, 900 + (1 - e.hp / e.maxHp) * 300);
  if (!best && sk.type !== 'execute') { for (const m of v.monsters) consider(m, 100); for (const m of v.minions) consider(m, 0); }
  if (best) {
    const lead = sk.type === 'line' ? Math.hypot(best.x - h.x, best.y - h.y) / sk.speed : sk.type === 'circle' ? sk.delay * 0.7 : 0.2;
    return { x: best.x + (best.vx || 0) * lead, y: best.y + (best.vy || 0) * lead };
  }
  if (sk.type === 'dash' || sk.type === 'leap' || sk.type === 'blink') {
    const mv = currentMove();
    if (mv) return { x: h.x + mv.x * 400, y: h.y + mv.y * 400 };
  }
  return { x: h.x + Math.cos(h.facing) * 300, y: h.y + Math.sin(h.facing) * 300 };
}

// Local check so a cast on cooldown fails instantly, even over the network.
function cast(key, x, y) {
  const v = S.view, h = v && v.player;
  if (!h) return;
  const sk = h.def.skill[key];
  let why = '';
  if (h.dead) why = 'dead';
  else if (key === 'ult' && h.level < D.ULT_LEVEL) why = 'locked';
  else if (h.cds[key] > 0.05) why = 'cooldown';
  else if (sk && h.mana < sk.mana) why = 'mana';
  else if (key === 'rg' && h.hp >= h.maxHp) why = 'full';
  if (why) { deny(key, why); return; }
  S.castSeq++;
  S.casts.push({ key, x, y });
  S.netCasts.push([S.castSeq, LF.net.KEYS.indexOf(key), Math.round(x), Math.round(y)]);
  if (S.netCasts.length > 4) S.netCasts.shift();
}
function deny(key, why) {
  const el = ui.skills[key];
  el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny');
  if (LF.audio) LF.audio.play('deny', 0.6);
  if (LF.ui) LF.ui.denyReason(key, why);
}

function regen() {
  if (!S.enabled) return;
  const h = S.view && S.view.player;
  if (h) cast('rg', h.x, h.y);
}

function recall() {
  if (!S.enabled) return;
  S.recallSeq++; S.recallDirty = true;
}

function currentMove() {
  let x = 0, y = 0;
  if (S.joy && Math.hypot(S.joy.x, S.joy.y) > 0.18) { x = S.joy.x; y = S.joy.y; }
  else {
    const k = S.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (!x && !y) return null;
  }
  const n = Math.hypot(x, y);
  return LF.render.dirToWorld(x / n, y / n);
}

// Hand inputs to the local hero (single player / host).
function applyLocal(h) {
  const I = h.input;
  const mv = currentMove();
  I.mv = mv;
  I.attack = S.attackKey || S.attackBtn;
  if (mv) { S.moveTo = null; I.moveTo = null; }
  if (S.moveDirty) { I.moveTo = S.moveTo; S.moveDirty = false; }
  if (S.targetDirty) { I.target = S.target ? S.target.id : 0; S.targetDirty = false; }
  if (S.recallDirty) { I.recall = true; S.recallDirty = false; }
  while (S.casts.length) I.casts.push(S.casts.shift());
  while (S.shop.length) I.shop.push(S.shop.shift());
  if (S.autoBuy !== h.autoBuy) I.autoBuy = S.autoBuy;
}

// Build the compact input object a client sends to the host.
function toNet() {
  const mv = currentMove();
  S.casts.length = 0; S.shop.length = 0;
  S.moveDirty = false; S.targetDirty = false; S.recallDirty = false;
  return {
    mv: mv ? [Math.round(mv.x * 100), Math.round(mv.y * 100)] : 0,
    a: S.attackKey || S.attackBtn ? 1 : 0,
    mt: S.moveTo ? [Math.round(S.moveTo.x), Math.round(S.moveTo.y)] : 0, ms: S.moveSeq,
    tg: LF.net.targetRef(S.target), ts: S.targetSeq,
    r: S.recallSeq,
    c: S.netCasts.slice(),
    sh: S.netShop.slice(),
    ab: S.autoBuy ? 1 : 0,
    bd: S.build ? S.build.map(id => D.ITEM_INDEX[id]) : 0,
  };
}

// Shop orders go through the same input path as everything else (local hero or host).
function shop(op, id) {
  S.shopSeq++;
  S.shop.push({ op, id });
  S.netShop.push([S.shopSeq, op === 'sell' ? 2 : 1, D.ITEM_INDEX[id]]);
  if (S.netShop.length > 6) S.netShop.shift();
}
function setAutoBuy(on) {
  S.autoBuy = !!on;
  try { localStorage.setItem('lf-autobuy', on ? '1' : '0'); } catch (e) { /* ignore */ }
}

// Use this build for the hero we play (the sim hero locally, the mirror hero on a client; a client's
// host hears about it through the input stream).
function setBuild(ids, h) {
  S.build = LF.sim.cleanBuild(ids);
  if (h) h.build = S.build || h.def.build;
}

function setView(v) { S.view = v; }
function enable(on) {
  S.enabled = on;
  if (!on) { S.keys.clear(); S.attackKey = S.attackBtn = false; S.aim = null; S.joy = null; S.steer = false; S.casts.length = 0; }
}
function reset() {
  S.moveTo = null; S.target = null; S.casts.length = 0; S.netCasts.length = 0; S.shop.length = 0; S.netShop.length = 0; S.shopSeq = 0; S.castSeq = 0; S.moveSeq = 0; S.targetSeq = 0; S.recallSeq = 0;
  S.moveDirty = S.targetDirty = S.recallDirty = false; S.aim = null; S.click = null;
}

// Current aim point for the indicator (keyboard aim follows the cursor).
function aimState() {
  if (!S.aim) return null;
  if (S.aim.src === 'key') {
    if (!S.mouse.inside) return null;
    const w = LF.render.screenToWorld(S.mouse.x, S.mouse.y);
    return { key: S.aim.key, x: w.x, y: w.y };
  }
  return S.aim.x !== undefined ? S.aim : null;
}

LF.input = { init, applyLocal, toNet, setView, enable, reset, shop, setAutoBuy, setBuild, aimState, hoverTarget, get click() { return S.click; }, state: S };
})(window.LF);
