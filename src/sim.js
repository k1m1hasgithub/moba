// Lanefall: authoritative game simulation. Runs in single player and on the multiplayer host.
'use strict';
(function (LF) {
const D = LF.data;
const { W, H, BLUE, RED, NEUTRAL } = D;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const gap = (a, b) => dist(a, b) - a.r - b.r;
const rand = (a, b) => a + Math.random() * (b - a);

const WAVE_EVERY = 25, FIRST_WAVE = 18, RECALL_TIME = 3.5;
const SOLIDS = D.OBSTACLES;

let G = null;

function unit(o) {
  return Object.assign({
    id: G.nextId++, dead: false, x: 0, y: 0, r: 20, hp: 1, maxHp: 1, armor: 0, ad: 0, as: 1, range: 0, ms: 0,
    atkCd: 0, target: null, facing: 0, stunT: 0, rootT: 0, slowT: 0, slowP: 0, shield: 0, shieldT: 0,
    atkN: 0, castN: 0, hitT: -9, deathT: 0,
  }, o);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
// cfg.seats: 10 entries (blue 0-4, red 5-9), seat % 5 = role index.
//   { hero, human, local, peer, name, diff }
function createGame(cfg) {
  G = {
    cfg, t: 0, nextId: 1, units: [], heroes: [], structs: [], monsters: [], minions: [], projs: [], zones: [],
    events: [], evSeq: 0, nextWave: FIRST_WAVE, wave: 0, kills: [0, 0], over: false, winner: -1,
    firstBlood: false, teamBuff: [0, 0], buyTimer: 0, player: null,
  };
  for (const team of [BLUE, RED]) {
    const list = D.STRUCTS[team].map((s, i) => {
      const st = D.STRUCT_STATS[s.tier];
      const u = unit({
        kind: s.type, team, x: s.x, y: s.y, r: st.r, hp: st.hp, maxHp: st.hp, ad: st.ad, range: st.range,
        as: st.as, armor: 40, lane: s.lane, tier: s.tier, idx: team * 7 + i, ranged: true, streak: 0, lastTarget: null,
        vis: 'tower', projSpeed: 1000,
      });
      G.structs.push(u); G.units.push(u);
      return u;
    });
    // Outer guards inner; the core opens once any inner tower falls.
    for (let i = 0; i < 3; i++) list[i * 2 + 1].guards = [list[i * 2]];
    list[6].guards = [list[1], list[3], list[5]];
    list[6].guardAny = true;
  }
  D.CAMPS.forEach((c, i) => {
    const def = D.MONSTERS[c.type];
    const m = unit({
      kind: 'monster', mtype: c.type, team: NEUTRAL, side: c.side, home: { x: c.x, y: c.y }, x: c.x, y: c.y,
      r: def.r, hp: def.hp, maxHp: def.hp, ad: def.ad, as: 0.8, range: 40, ms: 200, armor: 15,
      dead: true, respawnAt: def.first, idx: i, boss: !!def.boss,
    });
    G.monsters.push(m); G.units.push(m);
  });
  cfg.seats.forEach((s, seat) => {
    const h = makeHero(s, seat);
    G.heroes.push(h); G.units.push(h);
    if (s.local) G.player = h;
  });
  return G;
}

function makeHero(s, seat) {
  const team = seat < 5 ? BLUE : RED;
  const role = seat % 5;
  const def = D.HERO[s.hero];
  const f = D.FOUNTAIN[team];
  const a = (team === BLUE ? -Math.PI / 4 : Math.PI * 3 / 4) + (role - 2) * 0.35;
  const h = unit({
    kind: 'hero', seat, team, role, def, human: !!s.human, local: !!s.local, peer: s.peer || null, autoBuy: !s.human,
    name: s.name || def.name, diff: s.diff || 'normal',
    x: f.x + Math.cos(a) * 110, y: f.y + Math.sin(a) * 110, r: 26, facing: a,
    level: 1, xp: 0, gold: 300, goldTotal: 300, items: [], cds: { s1: 0, s2: 0, ult: 0 },
    respawn: 0, k: 0, d: 0, a: 0, cs: 0, streak: 0, multiN: 0, multiT: -99, assist: {},
    buffs: [], mana: 0, maxMana: 0, ap: 0, input: emptyInput(), ai: { next: Math.random() * 0.3 },
    moveTo: null, attackTarget: null, recall: null, dash: null, leap: null, air: 0,
    lastCombat: -99, lastDealt: -99, castKey: '', castT: -9, atkT: -9, stacks: 0, stackT: 0, shots: 0,
    empower: 0, riposte: false, failKey: '', failWhy: '', failT: -9, vx: 0, vy: 0,
  });
  recalc(h, true);
  return h;
}

function emptyInput() {
  return { mv: null, moveTo: null, attack: false, target: 0, casts: [], recall: false, shop: [], autoBuy: undefined };
}

// Recompute item and level stats. Temporary buffs are applied every tick in applyBuffs.
function recalc(h, reset) {
  const s = h.def.stats, L = h.level - 1;
  const b = {
    hp: s.hp + s.hpL * L, mana: s.mana + s.manaL * L, ad: s.ad + s.adL * L, armor: s.armor + s.armorL * L,
    as: s.as + s.asL * L, asBonus: 0, ms: s.ms, ap: 0, cdr: 0, ls: h.def.passive.id === 'bloodlust' ? 0.15 : 0,
    regen: s.regen + L * 0.6, manaRegen: 6 + L * 0.5, monster: 0, healing: h.def.passive.id === 'verdant' ? 0.2 : 0,
    crit: 0, armorPen: 0, magicPen: 0, spellVamp: 0, tenacity: 0,
  };
  // Normal attributes stack; unique attributes and passives count once per item.
  const once = new Set();
  h.ip = {};
  for (const id of h.items) {
    const it = D.ITEM[id];
    for (const k in it.stats) b[k === 'as' ? 'asBonus' : k] += it.stats[k];
    if (once.has(id)) continue;
    once.add(id);
    for (const k in it.unique) b[k] += it.unique[k];
    if (it.passive) h.ip[it.passive.id] = true;
  }
  if (reset) { h.hp = b.hp; h.mana = b.mana; }
  else { h.hp += Math.max(0, b.hp - h.maxHp); h.mana += Math.max(0, b.mana - h.maxMana); }
  h.maxHp = b.hp; h.maxMana = b.mana;
  h.hp = Math.min(h.hp, h.maxHp); h.mana = Math.min(h.mana, h.maxMana);
  h.base = b;
  applyBuffs(h);
}

function addBuff(u, spec, id) {
  if (!spec) return;
  u.buffs = u.buffs.filter(b => b.id !== id);
  u.buffs.push({ id, until: G.t + (spec.dur || 3), as: spec.as || 0, ms: spec.ms || 0, ad: spec.ad || 0, ls: spec.ls || 0, cdr: spec.cdr || 0, mregen: spec.mregen || 0 });
}
const hasBuff = (u, id) => u.buffs && u.buffs.some(b => b.id === id && b.until > G.t);

function applyBuffs(h) {
  const b = h.base;
  let as = b.asBonus, ms = 0, ad = 0, ls = b.ls, cdr = b.cdr, mregen = 0;
  for (const x of h.buffs) { as += x.as; ms += x.ms; ad += x.ad; ls += x.ls; cdr += x.cdr; mregen += x.mregen; }
  if (h.def.passive.id === 'hotbarrels' && h.stackT > G.t) as += h.stacks * 0.07;
  h.as = Math.min(2.5, b.as * (1 + as));
  h.ad = b.ad * (1 + ad);
  h.ls = ls;
  h.cdr = Math.min(0.4, cdr);
  h.armor = b.armor; h.ap = b.ap; h.monster = b.monster; h.healing = b.healing;
  h.crit = Math.min(0.8, b.crit); h.armorPen = b.armorPen; h.magicPen = b.magicPen; h.spellVamp = b.spellVamp; h.tenacity = Math.min(0.6, b.tenacity);
  h.regen = b.regen; h.manaRegen = b.manaRegen + mregen;
  h.range = h.def.stats.range;
  const slow = h.slowT > 0 ? h.slowP : 0;
  h.ms = Math.max(100, b.ms * (1 + ms - slow));
}

// ---------------------------------------------------------------------------
// Events (UI, sound and network all read these)
// ---------------------------------------------------------------------------
function ev(type, data) {
  G.evSeq++;
  G.events.push(Object.assign({ seq: G.evSeq, type, t: G.t }, data));
  if (G.events.length > 80) G.events.splice(0, G.events.length - 80);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
const guardOk = u => !u.guards || (u.guardAny ? u.guards.some(g => g.dead) : u.guards.every(g => g.dead));
const isTargetable = u => !!u && !u.dead && guardOk(u);
const isEnemy = (a, b) => a.team !== b.team;
const isStructure = u => u.kind === 'tower' || u.kind === 'core';

function enemyUnitsNear(h, x, y, r, opts = {}) {
  const out = [];
  for (const u of G.units) {
    if (u.dead || u.team === h.team || isStructure(u)) continue;
    if (opts.heroOnly && u.kind !== 'hero') continue;
    if (Math.hypot(u.x - x, u.y - y) <= r + u.r) out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------
function moveToward(u, tx, ty, dt, speed) {
  let dx = tx - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 3) return true;
  dx /= d; dy /= d;
  // Steer around rocks, trees and structures that sit on the straight line.
  const look = Math.min(d, 220);
  const steer = (o, pad) => {
    if (o === u.attackTarget || o === u.target) return;
    const rx = o.x - u.x, ry = o.y - u.y;
    const along = rx * dx + ry * dy;
    if (along <= 0 || along > look + o.r) return;
    const side = -rx * dy + ry * dx;
    const clear = o.r + u.r + pad;
    if (Math.abs(side) >= clear) return;
    const k = (side >= 0 ? -1 : 1) * (1 - Math.abs(side) / clear) * 1.8;
    const px = -dy, py = dx;
    dx += px * k; dy += py * k;
    const n = Math.hypot(dx, dy); dx /= n; dy /= n;
  };
  for (const o of SOLIDS) steer(o, 10);
  for (const s of G.structs) if (!s.dead) steer(s, 10);
  const step = Math.min(d, (speed || u.ms) * dt);
  u.x = clamp(u.x + dx * step, 40, W - 40);
  u.y = clamp(u.y + dy * step, 40, H - 40);
  u.facing = Math.atan2(dy, dx);
  u.movedT = G.t;
  return step >= d;
}

function moveDir(u, vx, vy, dt) {
  const n = Math.hypot(vx, vy);
  if (n < 0.01) return;
  moveToward(u, u.x + vx / n * 400, u.y + vy / n * 400, dt);
}

function pushOut(u) {
  for (const o of SOLIDS) {
    const dx = u.x - o.x, dy = u.y - o.y, min = u.r + o.r;
    const d = Math.hypot(dx, dy);
    if (d < min) { if (d < 0.01) { u.x += min; continue; } u.x = o.x + dx / d * min; u.y = o.y + dy / d * min; }
  }
  for (const s of G.structs) {
    if (s.dead) continue;
    const dx = u.x - s.x, dy = u.y - s.y, min = u.r + s.r;
    const d = Math.hypot(dx, dy);
    if (d < min) { if (d < 0.01) { u.y += min; continue; } u.x = s.x + dx / d * min; u.y = s.y + dy / d * min; }
  }
  u.x = clamp(u.x, 40, W - 40); u.y = clamp(u.y, 40, H - 40);
}

function separate() {
  const movers = [];
  for (const u of G.units) if (!u.dead && !isStructure(u) && !u.leap && !u.dash) movers.push(u);
  for (let i = 0; i < movers.length; i++) {
    const a = movers[i];
    for (let j = i + 1; j < movers.length; j++) {
      const b = movers[j];
      const min = a.r + b.r;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx > min || dx < -min || dy > min || dy < -min) continue;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d >= min) continue;
      const ma = a.kind === 'hero' ? 4 : a.boss ? 20 : 1, mb = b.kind === 'hero' ? 4 : b.boss ? 20 : 1;
      const push = (min - d) * 0.35, nx = dx / d, ny = dy / d;
      a.x -= nx * push * (mb / (ma + mb)) * 2; a.y -= ny * push * (mb / (ma + mb)) * 2;
      b.x += nx * push * (ma / (ma + mb)) * 2; b.y += ny * push * (ma / (ma + mb)) * 2;
    }
  }
  for (const m of movers) pushOut(m);
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
function heal(u, amt) {
  if (u.dead || amt <= 0) return 0;
  const before = u.hp;
  u.hp = Math.min(u.maxHp, u.hp + amt);
  return u.hp - before;
}
function giveShield(u, amt, dur) {
  u.shield = Math.max(u.shield, amt);
  u.shieldT = Math.max(u.shieldT, dur);
}
// Oracle Charm: allies you heal or shield get a burst of speed.
function bless(h, a) { if (h.ip.blessing && !a.dead) addBuff(a, { ms: 0.2, dur: 2 }, 'blessing'); }

function damage(src, tgt, raw, o) {
  o = o || {};
  if (!tgt || tgt.dead || raw <= 0 || G.over) return 0;
  let amt = raw;
  if (src && src.kind === 'hero') {
    if (tgt.kind === 'monster') {
      const p = src.def.passive.id;
      amt *= 1 + (src.monster || 0) + (p === 'ambush' || p === 'feral' ? 0.4 : 0);
    }
    if (G.teamBuff[src.team] > G.t) amt *= 1.15;
    if (src.ip.despair && tgt.kind === 'hero' && tgt.hp < tgt.maxHp * 0.5) amt *= 1.2;
    src.lastDealt = G.t;
    src.revealT = G.t;
  }
  if (src && src.kind === 'minion' && isStructure(tgt)) amt *= src.siege || 1;
  if (tgt.kind === 'hero' && tgt.def.passive.id === 'granite') amt *= 0.85;
  if (isStructure(tgt) && G.t < 180) amt *= 0.6;
  if (!o.trueDmg) {
    const pen = src && src.kind === 'hero' ? (o.attack ? src.armorPen : o.skill ? src.magicPen : 0) : 0;
    amt *= 100 / (100 + Math.max(0, (tgt.armor || 0) * (1 - pen)));
  }
  if (tgt.shield > 0) { const a = Math.min(tgt.shield, amt); tgt.shield -= a; amt -= a; }
  tgt.hp -= amt;
  tgt.hitT = G.t;
  if (tgt.kind === 'hero' && tgt.ip.fortify && tgt.hp > 0 && tgt.hp < tgt.maxHp * 0.4 && !(tgt.fortifyT > G.t)) {
    tgt.fortifyT = G.t + 30;
    giveShield(tgt, tgt.maxHp * 0.25, 4);
    ev('fx', { vis: 'fortify', x: tgt.x, y: tgt.y, team: tgt.team });
  }
  if (src && src.kind === 'hero') {
    tgt.lastHero = src; tgt.lastHeroT = G.t;
    if (tgt.kind === 'hero') {
      tgt.assist[src.seat] = G.t;
      src.lastCombat = G.t; tgt.lastCombat = G.t;
      callForHelp(tgt, src);
    }
    if (src.ls > 0 && (o.attack || o.skill) && !src.dead) heal(src, amt * src.ls);
    if (src.spellVamp > 0 && o.skill && !src.dead) heal(src, amt * src.spellVamp);
    if (o.attack && tgt.kind === 'hero' && !src.dead) {
      if (tgt.ip.thorns && !tgt.dead && tgt.hp > 0) damage(tgt, src, raw * 0.15, { trueDmg: true });
      if (tgt.ip.frostbite) applyCC(src, { slow: 0.2, dur: 1 });
    }
  }
  if (tgt.kind === 'hero') { tgt.recall = null; if (src) tgt.lastCombat = G.t; }
  if (tgt.kind === 'monster' && !tgt.resetting && src && (src.kind === 'hero' || src.kind === 'minion')) {
    if (!tgt.target || tgt.target.dead || (src.kind === 'hero' && tgt.target.kind !== 'hero')) tgt.target = src;
  }
  if (tgt.hp <= 0) kill(tgt, src);
  return amt;
}

// Towers and minions near a hero who is attacked by an enemy hero turn on the attacker.
function callForHelp(victim, attacker) {
  for (const s of G.structs) {
    if (s.dead || s.team !== victim.team) continue;
    if (gap(s, attacker) <= s.range) s.target = attacker;
  }
  for (const u of G.units) {
    if (u.kind === 'minion' && !u.dead && u.team === victim.team && dist(u, attacker) < 450) u.target = attacker;
  }
}

function applyCC(u, cc) {
  if (!cc || u.dead || isStructure(u)) return;
  if (u.boss) { if (cc.slow) { u.slowP = Math.max(u.slowP, cc.slow * 0.5); u.slowT = Math.max(u.slowT, cc.dur || 1); } return; }
  if (u.tenacity > 0) {
    const k = 1 - u.tenacity;
    cc = { stun: cc.stun && cc.stun * k, root: cc.root && cc.root * k, slow: cc.slow, dur: (cc.dur || 1) * k };
  }
  if (cc.stun) {
    u.stunT = Math.max(u.stunT, cc.stun);
    if (u.kind === 'hero') { u.recall = null; u.dash = null; }
  }
  if (cc.root) { u.rootT = Math.max(u.rootT, cc.root); if (u.kind === 'hero') u.recall = null; }
  if (cc.slow) {
    if (u.slowT <= 0 || cc.slow >= u.slowP) u.slowP = cc.slow;
    u.slowT = Math.max(u.slowT, cc.dur || 1);
  }
}

function gainGold(h, amt) {
  if (h.diff === 'hard' && !h.human) amt *= 1.1;
  h.gold += amt; h.goldTotal += amt;
}

function gainXp(h, amt) {
  if (h.level >= D.MAX_LEVEL) return;
  h.xp += amt;
  while (h.level < D.MAX_LEVEL && h.xp >= D.xpToNext(h.level)) {
    h.xp -= D.xpToNext(h.level);
    h.level++;
    recalc(h, false);
    ev('level', { seat: h.seat, level: h.level });
  }
  if (h.level >= D.MAX_LEVEL) h.xp = 0;
}

function kill(u, killer) {
  u.dead = true; u.hp = 0; u.deathT = G.t;
  const killerHero = killer && killer.kind === 'hero' ? killer : null;
  if (u.kind === 'minion') {
    if (killerHero) {
      gainGold(killerHero, u.gold); killerHero.cs++;
      ev('gold', { seat: killerHero.seat, amt: u.gold, x: u.x, y: u.y });
    }
    const near = G.heroes.filter(h => !h.dead && h.team !== u.team && dist(h, u) < 1000);
    for (const h of near) {
      gainXp(h, u.xp * (near.length > 1 ? 0.75 : 1));
      if (h !== killerHero && dist(h, u) < 900) gainGold(h, u.gold * 0.4);
    }
  } else if (u.kind === 'monster') {
    const def = D.MONSTERS[u.mtype];
    u.respawnAt = G.t + def.respawn;
    const credit = killerHero || (u.lastHero && G.t - u.lastHeroT < 5 ? u.lastHero : null);
    if (credit) {
      if (def.team) {
        for (const h of G.heroes) if (h.team === credit.team) { gainGold(h, def.gold); gainXp(h, def.xp); }
        if (def.buff === 'wyrm') G.teamBuff[credit.team] = G.t + 90;
      } else {
        gainGold(credit, def.gold); gainXp(credit, def.xp);
        ev('gold', { seat: credit.seat, amt: def.gold, x: u.x, y: u.y });
      }
      if (credit.ip.hunt && !credit.dead) { heal(credit, credit.maxHp * 0.12); credit.mana = Math.min(credit.maxMana, credit.mana + credit.maxMana * 0.12); }
      if (def.buff === 'azure') addBuff(credit, { cdr: 0.2, mregen: 12, dur: 70 }, 'azure');
      if (def.buff === 'ember') addBuff(credit, { dur: 70 }, 'ember');
      ev('monster', { mtype: u.mtype, team: credit.team, seat: credit.seat, boss: !!def.boss });
    }
  } else if (u.kind === 'hero') {
    heroDeath(u, killerHero);
  } else if (isStructure(u)) {
    for (const h of G.heroes) if (h.team !== u.team) gainGold(h, 120);
    ev('tower', { idx: u.idx, team: u.team, kind: u.kind, x: u.x, y: u.y });
    if (u.kind === 'core') gameOver(1 - u.team);
  }
}

const MULTI = ['', '', 'Double Kill', 'Triple Kill', 'Mega Kill', 'Wipe Out'];
function heroDeath(v, killer) {
  v.d++;
  v.respawn = Math.min(40, 5 + 1.8 * v.level);
  v.dash = null; v.leap = null; v.recall = null; v.air = 0; v.shield = 0;
  v.stunT = v.rootT = v.slowT = 0;
  v.buffs = [];
  v.attackTarget = null; v.moveTo = null;
  G.kills[1 - v.team]++;
  const credit = killer || (v.lastHero && G.t - v.lastHeroT < 10 && v.lastHero.team !== v.team ? v.lastHero : null);
  const assisters = G.heroes.filter(h => h.team !== v.team && h !== credit && v.assist[h.seat] > G.t - 10);
  let tag = '';
  if (credit) {
    credit.k++;
    gainGold(credit, 250 + 40 * Math.min(v.streak, 5));
    credit.streak++;
    credit.multiN = G.t - credit.multiT < 12 ? credit.multiN + 1 : 1;
    credit.multiT = G.t;
    if (!G.firstBlood) tag = 'First Blood';
    else if (credit.multiN >= 2) tag = MULTI[Math.min(5, credit.multiN)];
    else if (v.streak >= 3) tag = 'Shutdown';
    else if (credit.streak === 3) tag = 'Killing Spree';
    else if (credit.streak === 5) tag = 'Unstoppable';
    else if (credit.streak >= 7) tag = 'Legendary';
  }
  G.firstBlood = true;
  for (const a of assisters) { a.a++; gainGold(a, 90); }
  const xp = 90 + 30 * v.level;
  const sharers = G.heroes.filter(h => h.team !== v.team && !h.dead && (h === credit || assisters.includes(h) || dist(h, v) < 1000));
  for (const h of sharers) gainXp(h, xp / Math.max(1, Math.sqrt(sharers.length)));
  v.streak = 0;
  v.assist = {};
  ev('kill', { killer: credit ? credit.seat : -1, victim: v.seat, team: 1 - v.team, tag, x: v.x, y: v.y });
  if (G.heroes.filter(h => h.team === v.team).every(h => h.dead)) ev('ace', { team: 1 - v.team });
}

function gameOver(winner) {
  G.over = true; G.winner = winner;
  ev('gameover', { winner });
}

// ---------------------------------------------------------------------------
// Basic attacks
// ---------------------------------------------------------------------------
function heroAttack(h, t) {
  h.facing = Math.atan2(t.y - h.y, t.x - h.x);
  if (h.atkCd > 0) return;
  h.atkCd = 1 / h.as;
  h.atkN = (h.atkN + 1) % 1000; h.atkT = G.t;
  h.recall = null;
  let mult = 1;
  const fx = {};
  const p = h.def.passive.id;
  if (p === 'thirdshot') { h.shots++; if (h.shots >= 3) { h.shots = 0; mult += 0.6; fx.slow = true; fx.big = true; } }
  if (p === 'hotbarrels') { h.stacks = h.stackT > G.t ? Math.min(6, h.stacks + 1) : 1; h.stackT = G.t + 3; }
  if (p === 'ambush' && G.t - h.lastDealt > 4) { mult += 0.8; fx.big = true; }
  if (h.riposte) { mult += 0.6; fx.heal = 40 + 6 * h.level; h.riposte = false; fx.big = true; }
  if (h.empower) { mult += h.empower; h.empower = 0; fx.big = true; }
  if (h.crit > 0 && Math.random() < h.crit) { mult *= 1.75; fx.big = true; fx.crit = true; }
  if (h.ip.gale) { h.galeN = ((h.galeN || 0) + 1) % 3; if (!h.galeN) fx.gale = true; }
  const dmg = h.ad * mult;
  if (h.def.attack.melee) attackHit(h, t, dmg, fx);
  else G.projs.push({ id: G.nextId++, kind: 'auto', x: h.x + Math.cos(h.facing) * 24, y: h.y + Math.sin(h.facing) * 24 - 30, tgt: t, src: h, dmg, fx, speed: h.def.attack.speed, vis: h.def.attack.proj, big: !!fx.big, team: h.team });
}
function attackHit(h, t, dmg, fx) {
  if (h.ip.ruin && !isStructure(t)) dmg += Math.min(t.kind === 'monster' ? 80 : Infinity, t.hp * 0.05);
  const x = t.x, y = t.y;
  const dealt = damage(h, t, dmg, { attack: true });
  if (fx.crit) ev('fx', { vis: 'crit', x, y, team: h.team });
  if (fx.gale) {
    // Tempest Bow: lightning jumps to two more enemies near the target.
    const near = enemyUnitsNear(h, x, y, 350).filter(u => u !== t && !isStructure(u) && seen(h.team, u)).sort((a, b) => dist(a, t) - dist(b, t)).slice(0, 2);
    for (const u of near) {
      ev('fx', { vis: 'zap', x, y, x2: u.x, y2: u.y, team: h.team });
      damage(h, u, 60 + 0.3 * h.ad, {});
    }
  }
  if (t.dead) return;
  if (fx.slow) applyCC(t, { slow: 0.25, dur: 1 });
  if (fx.heal) heal(h, fx.heal);
  if (hasBuff(h, 'ember')) { applyCC(t, { slow: 0.2, dur: 1 }); damage(h, t, Math.min(140, t.maxHp * 0.02), { trueDmg: true }); }
  if (h.def.passive.id === 'feral') heal(h, dealt * 0.1);
}

function unitAttack(u, t) {
  u.facing = Math.atan2(t.y - u.y, t.x - u.x);
  if (u.atkCd > 0) return;
  u.atkCd = 1 / u.as;
  u.atkN = (u.atkN + 1) % 1000; u.atkT = G.t;
  let dmg = u.ad;
  if (u.kind === 'tower' || u.kind === 'core') {
    if (t.kind === 'hero') { u.streak = u.lastTarget === t ? Math.min(4, u.streak + 1) : 0; dmg *= 1 + u.streak * 0.3; }
    else { u.streak = 0; if (t.kind === 'minion') dmg = t.maxHp * (t.mtype === 'siege' ? 0.18 : 0.36) + 20; }
    u.lastTarget = t;
  }
  if (u.ranged) {
    const oy = isStructure(u) ? (u.kind === 'core' ? -110 : -96) : -20;
    G.projs.push({ id: G.nextId++, kind: 'auto', x: u.x, y: u.y + oy, tgt: t, src: u, dmg, fx: {}, speed: u.projSpeed || 800, vis: u.vis || 'minion', team: u.team });
  } else {
    damage(u, t, dmg, { attack: true });
  }
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
function skillValue(h, d, tgt) {
  if (!d) return 0;
  let v = d.b + d.l * (h.level - 1) + (d.ad || 0) * h.ad + (d.ap || 0) * h.ap + (d.hp || 0) * h.maxHp;
  if (d.missing && tgt) v += d.missing * (tgt.maxHp - tgt.hp);
  return v;
}
function skillHit(h, tgt, sk, mult) {
  if (tgt.dead) return;
  if (sk.dmg) {
    let v = skillValue(h, sk.dmg, tgt) * (mult || 1);
    if (h.def.passive.id === 'radiance' && tgt.hp < tgt.maxHp * 0.5) v *= 1.15;
    if (h.ip.void) v *= 1.1;
    if (h.ip.echo && !(h.echoT > G.t)) { h.echoT = G.t + 8; v += 80 + 0.3 * h.ap; ev('fx', { vis: 'echo', x: tgt.x, y: tgt.y, team: h.team }); }
    damage(h, tgt, v, { skill: true });
    if (h.ip.rampage && tgt.kind === 'hero' && !(h.rampT > G.t)) { h.rampT = G.t + 0.5; heal(h, h.maxHp * 0.03); }
  }
  if (tgt.dead) return;
  if (sk.cc) applyCC(tgt, sk.cc);
  if (h.def.passive.id === 'hex') applyCC(tgt, { slow: 0.2, dur: 1.2 });
}
const healPower = h => 1 + (h.healing || 0);

function cast(h, key, ax, ay) {
  const sk = h.def.skill[key];
  if (!sk) return 'none';
  if (h.dead) return 'dead';
  if (h.stunT > 0 || h.leap || h.dash) return 'busy';
  if (key === 'ult' && h.level < D.ULT_LEVEL) return 'locked';
  if (h.cds[key] > 0) return 'cooldown';
  if (h.mana < sk.mana) return 'mana';
  const mobility = sk.type === 'dash' || sk.type === 'leap' || sk.type === 'blink' || sk.type === 'execute';
  if (mobility && h.rootT > 0) return 'rooted';
  let ang = Math.atan2(ay - h.y, ax - h.x);
  if (!isFinite(ang) || (Math.abs(ax - h.x) < 1 && Math.abs(ay - h.y) < 1)) ang = h.facing;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const want = Math.hypot(ax - h.x, ay - h.y);
  const at = r => ({ x: clamp(h.x + cos * r, 40, W - 40), y: clamp(h.y + sin * r, 40, H - 40) });

  if (sk.type === 'execute') {
    let best = null, bd = Infinity;
    for (const u of G.heroes) {
      if (u.dead || u.team === h.team || !seen(h.team, u) || dist(h, u) > sk.range + u.r) continue;
      const d = Math.hypot(u.x - ax, u.y - ay);
      if (d < bd) { bd = d; best = u; }
    }
    if (!best) return 'notarget';
    const a2 = Math.atan2(best.y - h.y, best.x - h.x);
    h.x = best.x - Math.cos(a2) * (best.r + h.r + 4);
    h.y = best.y - Math.sin(a2) * (best.r + h.r + 4);
    pushOut(h);
    h.facing = a2;
    ev('fx', { vis: 'execute', x: best.x, y: best.y, team: h.team });
    skillHit(h, best, sk);
    h.cds[key] = sk.cd * (1 - h.cdr) * (best.dead ? 0.5 : 1);
  } else {
    if (sk.type === 'line') {
      G.projs.push({
        id: G.nextId++, kind: 'line', x: h.x + cos * 20, y: h.y + sin * 20 - 26, vx: cos * sk.speed, vy: sin * sk.speed,
        speed: sk.speed, range: sk.range, trav: 0, width: sk.width, pierce: !!sk.pierce, heroOnly: !!sk.heroOnly,
        hit: new Set(), sk, src: h, team: h.team, vis: sk.vis, ang,
      });
    } else if (sk.type === 'circle') {
      const p = at(Math.min(sk.range, want));
      G.zones.push({ id: G.nextId++, kind: 'circle', x: p.x, y: p.y, r: sk.radius, team: h.team, src: h, sk, t: 0, delay: sk.delay, vis: sk.vis });
    } else if (sk.type === 'zone') {
      const p = sk.follow ? h : at(Math.min(sk.range || 0, want));
      G.zones.push({ id: G.nextId++, kind: 'zone', x: p.x, y: p.y, r: sk.radius, team: h.team, src: h, sk, t: 0, dur: sk.dur, tick: sk.tick, next: 0, follow: sk.follow ? h : null, vis: sk.vis });
      if (sk.buff) addBuff(h, sk.buff, key);
    } else if (sk.type === 'nova') {
      for (const u of enemyUnitsNear(h, h.x, h.y, sk.radius)) {
        skillHit(h, u, sk);
        if (sk.healPerHero && u.kind === 'hero') heal(h, h.maxHp * sk.healPerHero);
      }
      if (sk.heal || sk.allyShield) {
        for (const a of G.heroes) {
          if (a.dead || a.team !== h.team || dist(a, h) > sk.radius + a.r) continue;
          if (sk.heal) {
            const got = heal(a, skillValue(h, sk.heal) * healPower(h));
            if (got > 1) ev('heal', { seat: a.seat, amt: Math.round(got) });
          }
          if (sk.allyShield) giveShield(a, skillValue(h, sk.allyShield), sk.allyShield.dur);
          if (a !== h) bless(h, a);
        }
      }
      ev('fx', { vis: sk.vis, x: h.x, y: h.y, r: sk.radius, team: h.team });
    } else if (sk.type === 'cone') {
      for (const u of enemyUnitsNear(h, h.x, h.y, sk.range)) {
        let da = Math.atan2(u.y - h.y, u.x - h.x) - ang;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) <= sk.angle / 2) skillHit(h, u, sk);
      }
      ev('fx', { vis: sk.vis, x: h.x, y: h.y, r: sk.range, ang, angle: sk.angle, team: h.team });
    } else if (sk.type === 'dash') {
      h.dash = { vx: cos * sk.speed, vy: sin * sk.speed, left: sk.range, sk, hit: new Set() };
      if (sk.empower) h.empower = sk.empower;
      if (sk.buff) addBuff(h, sk.buff, key);
    } else if (sk.type === 'leap') {
      const p = at(Math.min(sk.range, Math.max(120, want)));
      h.leap = { x0: h.x, y0: h.y, x1: p.x, y1: p.y, t: 0, dur: 0.45, sk, key };
    } else if (sk.type === 'blink') {
      const p = at(Math.min(sk.range, Math.max(150, want)));
      ev('fx', { vis: 'blink', x: h.x, y: h.y, x2: p.x, y2: p.y, team: h.team });
      h.x = p.x; h.y = p.y;
      pushOut(h);
    } else if (sk.type === 'buff') {
      addBuff(h, sk.buff, key);
      if (sk.buff.shield) giveShield(h, skillValue(h, sk.buff.shield), sk.buff.dur);
      ev('fx', { vis: 'buff', x: h.x, y: h.y, team: h.team, seat: h.seat });
    }
    h.cds[key] = sk.cd * (1 - h.cdr);
  }
  h.mana -= sk.mana;
  h.castN = (h.castN + 1) % 1000; h.castKey = key; h.castT = G.t;
  h.facing = ang;
  h.recall = null;
  if (h.def.passive.id === 'riposte') h.riposte = true;
  if (h.ip.fury) {
    h.furyN = hasBuff(h, 'fury') ? Math.min(3, h.furyN + 1) : 1;
    addBuff(h, { ad: 0.1 * h.furyN, dur: 4 }, 'fury');
    applyBuffs(h);
  }
  ev('cast', { seat: h.seat, key });
  return '';
}

function updateDash(h, dt) {
  const d = h.dash, sk = d.sk;
  const step = Math.min(d.left, Math.hypot(d.vx, d.vy) * dt);
  const n = Math.hypot(d.vx, d.vy);
  const nx = h.x + d.vx / n * step, ny = h.y + d.vy / n * step;
  for (const o of SOLIDS) if (Math.hypot(o.x - nx, o.y - ny) < o.r + h.r * 0.6) { h.dash = null; pushOut(h); return; }
  h.x = clamp(nx, 40, W - 40); h.y = clamp(ny, 40, H - 40);
  h.facing = Math.atan2(d.vy, d.vx);
  d.left -= step;
  for (const u of enemyUnitsNear(h, h.x, h.y, (sk.width || 60) / 2)) {
    if (d.hit.has(u.id)) continue;
    d.hit.add(u.id);
    if (sk.dmg || sk.cc) skillHit(h, u, sk);
    if (sk.stopOnHero && u.kind === 'hero') { d.left = 0; break; }
  }
  if (d.left <= 0.5) { h.dash = null; pushOut(h); }
}

function updateLeap(h, dt) {
  const L = h.leap;
  L.t += dt;
  const k = Math.min(1, L.t / L.dur);
  h.x = L.x0 + (L.x1 - L.x0) * k; h.y = L.y0 + (L.y1 - L.y0) * k;
  h.air = Math.sin(Math.PI * k) * 70;
  h.facing = Math.atan2(L.y1 - L.y0, L.x1 - L.x0);
  if (k >= 1) {
    h.leap = null; h.air = 0;
    pushOut(h);
    const sk = L.sk;
    for (const u of enemyUnitsNear(h, h.x, h.y, sk.radius)) skillHit(h, u, sk);
    if (sk.buff) addBuff(h, sk.buff, L.key);
    ev('fx', { vis: sk.vis, x: h.x, y: h.y, r: sk.radius, team: h.team });
  }
}

function updateZones(dt) {
  for (const z of G.zones) {
    z.t += dt;
    if (z.follow) {
      if (z.follow.dead) { z.done = true; continue; }
      z.x = z.follow.x; z.y = z.follow.y;
    }
    const sk = z.sk, h = z.src;
    if (z.kind === 'circle') {
      if (z.t >= z.delay) {
        for (const u of enemyUnitsNear(h, z.x, z.y, z.r)) skillHit(h, u, sk);
        ev('fx', { vis: z.vis, x: z.x, y: z.y, r: z.r, team: z.team });
        z.done = true;
      }
    } else {
      z.next -= dt;
      if (z.next <= 0) {
        z.next += z.tick;
        for (const u of enemyUnitsNear(h, z.x, z.y, z.r)) {
          if (sk.dmg || sk.cc) skillHit(h, u, sk);
          if (sk.pull && !u.dead && !u.boss) {
            const d = dist(u, z), k = Math.min(d, sk.pull * z.tick);
            if (d > 1) { u.x -= (u.x - z.x) / d * k; u.y -= (u.y - z.y) / d * k; }
          }
        }
        if (sk.heal) {
          for (const a of G.heroes) {
            if (a.dead || a.team !== z.team || dist(a, z) > z.r + a.r) continue;
            const got = heal(a, skillValue(h, sk.heal) * healPower(h));
            if (got > 1) ev('heal', { seat: a.seat, amt: Math.round(got) });
            if (a !== h) bless(h, a);
          }
        }
      }
      if (z.t >= z.dur) z.done = true;
    }
  }
  G.zones = G.zones.filter(z => !z.done);
}

function updateProjectiles(dt) {
  for (const p of G.projs) {
    if (p.kind === 'auto') {
      const t = p.tgt;
      if (t.dead) { p.done = true; continue; }
      const ty = t.y - (t.kind === 'hero' ? 30 : isStructure(t) ? 40 : 14);
      const dx = t.x - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= step + 8) {
        p.done = true;
        if (p.src.kind === 'hero') attackHit(p.src, t, p.dmg, p.fx);
        else damage(p.src, t, p.dmg, { attack: true });
      } else { p.x += dx / d * step; p.y += dy / d * step; }
    } else {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.trav += p.speed * dt;
      const groundY = p.y + 26;
      for (const u of G.units) {
        if (u.dead || u.team === p.team || isStructure(u) || p.hit.has(u.id)) continue;
        if (p.heroOnly && u.kind !== 'hero') continue;
        if (Math.hypot(u.x - p.x, u.y - groundY) < u.r + p.width / 2) {
          p.hit.add(u.id);
          skillHit(p.src, u, p.sk);
          ev('fx', { vis: 'impact', x: u.x, y: u.y - 20, team: p.team, kind: p.vis });
          if (!p.pierce) { p.done = true; break; }
        }
      }
      if (p.trav >= p.range) p.done = true;
    }
  }
  G.projs = G.projs.filter(p => !p.done);
}

// ---------------------------------------------------------------------------
// Minions, towers, monsters
// ---------------------------------------------------------------------------
function spawnWave() {
  G.wave++;
  const k = 1 + 0.045 * (G.wave - 1);
  const types = ['melee', 'melee', 'caster', 'caster'];
  if (G.wave % 3 === 0) types.push('siege');
  for (const team of [BLUE, RED]) {
    const core = G.structs[team * 7 + 6];
    if (core.dead) continue;
    for (const laneId of D.LANE_IDS) {
      const lane = D.LANES[laneId];
      const dir = team === BLUE ? 1 : -1;
      const s0 = team === BLUE ? 0 : lane.len;
      types.forEach((type, i) => {
        const st = D.MINION[type];
        const p = D.laneAt(lane, s0 - dir * (i * 46));
        const side = (i % 2 ? 1 : -1) * 16;
        G.units.push(unit({
          kind: 'minion', mtype: type, team, lane: laneId, x: p.x - p.dy * side, y: p.y + p.dx * side,
          r: st.r, hp: st.hp * k, maxHp: st.hp * k, ad: st.ad * (1 + 0.035 * (G.wave - 1)), as: st.as, range: st.range, ms: st.ms,
          armor: st.armor, gold: st.gold, xp: st.xp, ranged: !!st.proj, vis: st.proj, projSpeed: st.speed, siege: st.siege || 1,
          wp: team === BLUE ? 1 : lane.pts.length - 2, side, facing: Math.atan2(p.dy * dir, p.dx * dir),
        }));
      });
    }
  }
}

function acquireFor(u, radius) {
  let best = null, bestScore = Infinity;
  for (const o of G.units) {
    if (o.team === u.team || o.kind === 'monster' || !isTargetable(o) || !seen(u.team, o)) continue;
    const g = gap(u, o);
    if (g > radius) continue;
    const score = g + (o.kind === 'hero' ? 160 : 0) + (isStructure(o) ? 40 : 0);
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

function updateMinion(m, dt) {
  if (m.stunT > 0) return;
  const t = m.target;
  if (t && !(isTargetable(t) && t.team !== m.team && seen(m.team, t) && gap(m, t) <= 520)) m.target = null;
  if (!m.target || (m.target.kind !== 'minion' && (m.retarget = (m.retarget || 0) - dt) <= 0)) {
    m.retarget = 0.6;
    const n = acquireFor(m, 380);
    if (n) m.target = n;
  }
  if (m.target) {
    if (gap(m, m.target) <= m.range) unitAttack(m, m.target);
    else if (m.rootT <= 0) moveToward(m, m.target.x, m.target.y, dt);
    return;
  }
  if (m.rootT > 0) return;
  const lane = D.LANES[m.lane];
  const dir = m.team === BLUE ? 1 : -1;
  let wp = lane.pts[m.wp];
  if (!wp) { const c = G.structs[(1 - m.team) * 7 + 6]; moveToward(m, c.x, c.y, dt); return; }
  const prev = lane.pts[m.wp - dir] || wp;
  const segLen = Math.hypot(wp.x - prev.x, wp.y - prev.y) || 1;
  const px = -(wp.y - prev.y) / segLen, py = (wp.x - prev.x) / segLen;
  const tx = wp.x + px * m.side, ty = wp.y + py * m.side;
  if (Math.hypot(tx - m.x, ty - m.y) < 50) m.wp += dir;
  else moveToward(m, tx, ty, dt);
}

function updateStructure(s) {
  const t = s.target;
  if (t && !(isTargetable(t) && t.team !== s.team && t.kind !== 'monster' && seen(s.team, t) && gap(s, t) <= s.range)) s.target = null;
  if (!s.target) {
    let best = null, bestScore = Infinity;
    for (const o of G.units) {
      if (o.team === s.team || o.kind === 'monster' || isStructure(o) || !isTargetable(o) || !seen(s.team, o)) continue;
      const g = gap(s, o);
      if (g > s.range) continue;
      const score = g + (o.kind === 'hero' ? 10000 : 0);
      if (score < bestScore) { bestScore = score; best = o; }
    }
    s.target = best;
  }
  if (s.target) unitAttack(s, s.target);
}

function spawnMonster(m) {
  const def = D.MONSTERS[m.mtype];
  const k = 1 + 0.06 * (G.t / 60);
  m.dead = false; m.hp = m.maxHp = def.hp * k; m.ad = def.ad * k;
  m.x = m.home.x; m.y = m.home.y; m.target = null; m.resetting = false;
  m.stunT = m.rootT = m.slowT = 0;
  if (def.boss) ev('spawn', { mtype: m.mtype });
}

function updateMonster(m, dt) {
  if (m.dead) { if (G.t >= m.respawnAt && G.t - m.deathT > 1) spawnMonster(m); return; }
  const leash = m.boss ? 650 : 520;
  if (m.target && !(isTargetable(m.target) && Math.hypot(m.target.x - m.home.x, m.target.y - m.home.y) < leash + 150)) {
    m.target = null; m.resetting = true;
  }
  if (m.resetting) {
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25 * dt);
    if (moveToward(m, m.home.x, m.home.y, dt, 420)) { m.resetting = false; m.hp = m.maxHp; }
    return;
  }
  if (m.stunT > 0) return;
  if (m.target) {
    if (Math.hypot(m.x - m.home.x, m.y - m.home.y) > leash) { m.target = null; m.resetting = true; return; }
    if (gap(m, m.target) <= m.range) unitAttack(m, m.target);
    else if (m.rootT <= 0) moveToward(m, m.target.x, m.target.y, dt);
  }
}

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------
function respawnHero(h) {
  const f = D.FOUNTAIN[h.team];
  h.dead = false;
  const a = (h.team === BLUE ? -Math.PI / 4 : Math.PI * 3 / 4) + (h.role - 2) * 0.35;
  h.x = f.x + Math.cos(a) * 110; h.y = f.y + Math.sin(a) * 110;
  h.hp = h.maxHp; h.mana = h.maxMana;
  h.moveTo = null; h.attackTarget = null; h.input.moveTo = null;
  h.ai.state = null;
  ev('respawn', { seat: h.seat });
}

function startRecall(h) {
  if (h.dead || h.recall || h.dash || h.leap) return;
  h.recall = { t: 0 };
  h.attackTarget = null; h.moveTo = null; h.input.moveTo = null;
  ev('recall', { seat: h.seat });
}

// ---------------------------------------------------------------------------
// Bushes and visibility
// ---------------------------------------------------------------------------
// A hero in a bush is hidden from the enemy team unless an enemy hero stands in the same
// bush, or it dealt damage in the last second.
function updateVisibility() {
  for (const h of G.heroes) h.bush = h.dead ? -1 : D.bushAt(h.x, h.y);
  for (const h of G.heroes) {
    if (!h.hidden) h.hidden = [false, false];
    for (const team of [BLUE, RED]) {
      if (team === h.team || h.dead || h.bush < 0 || G.t - (h.revealT || -9) < 1) { h.hidden[team] = false; continue; }
      h.hidden[team] = !G.heroes.some(o => !o.dead && o.team === team && o.bush === h.bush);
    }
  }
}
// Can `team` see unit `u`? Only heroes can hide.
const seen = (team, u) => !(u.kind === 'hero' && u.hidden && team < 2 && u.hidden[team]);

function pickAttackTarget(h, radius) {
  let best = null, bestScore = Infinity;
  for (const o of G.units) {
    if (o.team === h.team || !isTargetable(o) || !seen(h.team, o)) continue;
    const g = gap(h, o);
    if (g > radius) continue;
    let score = g;
    if (o.kind === 'hero') score -= 500 + (1 - o.hp / o.maxHp) * 200;
    else if (isStructure(o)) score += 120;
    else if (o.kind === 'monster') score += 30;
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

function updateHero(h, dt) {
  if (h.human) processShop(h);
  if (h.dead) {
    h.respawn -= dt;
    if (h.respawn <= 0) respawnHero(h);
    return;
  }
  for (const k of ['s1', 's2', 'ult']) h.cds[k] = Math.max(0, h.cds[k] - dt);
  if (h.shieldT > 0) { h.shieldT -= dt; if (h.shieldT <= 0) h.shield = 0; }
  if (h.buffs.length) h.buffs = h.buffs.filter(b => b.until > G.t);
  applyBuffs(h);
  h.hp = Math.min(h.maxHp, h.hp + h.regen * dt);
  h.mana = Math.min(h.maxMana, h.mana + h.manaRegen * dt);
  if (h.def.passive.id === 'verdant') {
    for (const a of G.heroes) if (!a.dead && a.team === h.team && dist(a, h) < 450) a.hp = Math.min(a.maxHp, a.hp + (3 + 0.6 * h.level) * dt);
  }
  const own = D.FOUNTAIN[h.team], foe = D.FOUNTAIN[1 - h.team];
  if (dist(h, own) < own.r) {
    h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.15 * dt);
    h.mana = Math.min(h.maxMana, h.mana + h.maxMana * 0.2 * dt);
  }
  if (dist(h, foe) < foe.r + 120) { damage(null, h, 1500 * dt, { trueDmg: true }); if (h.dead) return; }

  if (h.recall) {
    h.recall.t += dt;
    if (h.recall.t >= RECALL_TIME) {
      const a = (h.team === BLUE ? -Math.PI / 4 : Math.PI * 3 / 4);
      h.x = own.x + Math.cos(a) * 90; h.y = own.y + Math.sin(a) * 90;
      h.recall = null;
      ev('recalled', { seat: h.seat });
    }
  }
  if (h.leap) { updateLeap(h, dt); return; }
  if (h.dash) { updateDash(h, dt); return; }
  if (h.stunT > 0) return;
  if (h.human) controlHuman(h, dt);
  else controlBot(h, dt);
}

const validFoe = (h, t) => isTargetable(t) && t.team !== h.team && seen(h.team, t);

function controlHuman(h, dt) {
  const inp = h.input;
  while (inp.casts.length) {
    const c = inp.casts.shift();
    const why = cast(h, c.key, c.x, c.y);
    if (why) { h.failKey = c.key; h.failWhy = why; h.failT = G.t; }
    if (h.dead || h.leap || h.dash || h.stunT > 0) return;
  }
  if (inp.recall) { inp.recall = false; startRecall(h); }
  const mv = inp.mv;
  const moving = !!mv && Math.hypot(mv.x, mv.y) > 0.15 && h.rootT <= 0;
  if (moving && h.recall) h.recall = null;
  if (inp.target) {
    const t = G.units.find(u => u.id === inp.target);
    inp.target = 0;
    if (t && validFoe(h, t)) { h.attackTarget = t; inp.moveTo = null; }
  }
  if (inp.attack) {
    const t = h.attackTarget;
    if (!t || !validFoe(h, t) || gap(h, t) > h.range + 320) h.attackTarget = pickAttackTarget(h, h.range + 240);
    if (h.attackTarget) inp.moveTo = null;
  }
  if (h.attackTarget && !validFoe(h, h.attackTarget)) h.attackTarget = null;
  if (moving && !inp.attack) {
    h.attackTarget = null; inp.moveTo = null;
    moveDir(h, mv.x, mv.y, dt);
    return;
  }
  const t = h.attackTarget;
  if (t) {
    if (gap(h, t) <= h.range) { if (!h.recall) heroAttack(h, t); }
    else if (gap(h, t) > h.range + 600 && !inp.attack) h.attackTarget = null;
    else if (moving) moveDir(h, mv.x, mv.y, dt);
    else if (h.rootT <= 0) moveToward(h, t.x, t.y, dt);
    return;
  }
  if (moving) { moveDir(h, mv.x, mv.y, dt); return; }
  if (inp.moveTo && h.rootT <= 0) {
    if (h.recall) h.recall = null;
    if (moveToward(h, inp.moveTo.x, inp.moveTo.y, dt)) inp.moveTo = null;
  }
}

function controlBot(h, dt) {
  h.ai.next -= dt;
  if (h.ai.next <= 0) {
    h.ai.next = D.DIFFICULTY[h.diff].think * rand(0.8, 1.2);
    LF.ai.think(h, G);
    if (h.dead || h.leap || h.dash || h.stunT > 0) return;
  }
  const t = h.attackTarget;
  if (t && validFoe(h, t)) {
    if (gap(h, t) <= h.range) heroAttack(h, t);
    else if (h.rootT <= 0) moveToward(h, t.x, t.y, dt);
  } else {
    h.attackTarget = null;
    if (h.moveTo && h.rootT <= 0) { if (moveToward(h, h.moveTo.x, h.moveTo.y, dt)) h.moveTo = null; }
  }
}

// ---------------------------------------------------------------------------
// Shop. Items can be bought anywhere; selling refunds 60% of the full price. Buying a crafted item uses
// up the components you own (recursively) and charges the crafting fee plus the missing parts.
// Only one pair of boots.
// ---------------------------------------------------------------------------
const SELL_RATE = 0.6;
function purchasePlan(items, id) {
  const pool = items.slice(), used = [], missing = [];
  let cost = 0;
  const need = (iid, top) => {
    if (!top) {
      const k = pool.indexOf(iid);
      if (k >= 0) { pool.splice(k, 1); used.push(iid); return; }
      missing.push(iid);
    }
    const it = D.ITEM[iid];
    cost += it.price;
    for (const c of it.from || []) need(c, false);
  };
  need(id, true);
  return { cost, used, missing, left: pool };
}
function canBuy(h, id) {
  const it = D.ITEM[id];
  if (!it) return 'unknown';
  const p = purchasePlan(h.items, id);
  if (p.left.length >= 6) return 'full';
  if (it.boots && p.left.some(i => D.ITEM[i].boots)) return 'boots';
  if (h.gold < p.cost) return 'gold';
  return '';
}
function buyItem(h, id) {
  if (canBuy(h, id)) return false;
  const p = purchasePlan(h.items, id);
  h.gold -= p.cost;
  // The new item takes the slot of the first component it used up.
  let slot = -1;
  for (const u of p.used) { const k = h.items.indexOf(u); if (slot < 0 || k < slot) slot = k; h.items[k] = null; }
  if (slot >= 0) h.items[slot] = id; else h.items.push(id);
  h.items = h.items.filter(Boolean);
  recalc(h, false);
  ev('buy', { seat: h.seat, item: id });
  return true;
}
function sellItem(h, id) {
  const i = h.items.indexOf(id);
  if (i < 0) return false;
  h.items.splice(i, 1);
  h.gold += Math.round(D.ITEM[id].cost * SELL_RATE);
  recalc(h, false);
  ev('sell', { seat: h.seat, item: id });
  return true;
}
// Next finished item of the hero's recommended build that it doesn't own yet.
function nextRecommended(h) {
  const left = h.items.slice();
  for (const id of h.def.build) {
    const k = left.indexOf(id);
    if (k >= 0) { left.splice(k, 1); continue; }
    if (D.ITEM[id].boots && h.items.some(i => D.ITEM[i].boots && D.ITEM[i].tier === 2)) continue;
    return id;
  }
  return null;
}
// What to buy right now toward `target`: the item itself if affordable, otherwise its most expensive
// affordable missing component. Returns { id, target } or null.
function nextPurchase(h, target) {
  target = target || nextRecommended(h);
  if (!target) return null;
  const why = canBuy(h, target);
  if (!why) return { id: target, target };
  if (why !== 'gold') return null;
  let best = null;
  for (const c of purchasePlan(h.items, target).missing) {
    if (canBuy(h, c)) continue;
    if (!best || D.ITEM[c].cost > D.ITEM[best].cost) best = c;
  }
  return best ? { id: best, target } : null;
}
function processShop(h) {
  const I = h.input;
  if (I.autoBuy !== undefined) { h.autoBuy = !!I.autoBuy; I.autoBuy = undefined; }
  while (I.shop.length) {
    const op = I.shop.shift();
    if (op.op === 'buy') buyItem(h, op.id);
    else if (op.op === 'sell') sellItem(h, op.id);
  }
}
function autoBuy() {
  for (const h of G.heroes) {
    if (!h.autoBuy) continue;
    for (let n = 0; n < 4; n++) {
      const next = nextPurchase(h);
      if (!next || !buyItem(h, next.id)) break;
    }
  }
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------
function update(dt) {
  if (G.over) return;
  G.t += dt;
  if (G.t >= G.nextWave) { spawnWave(); G.nextWave += WAVE_EVERY; }
  for (const u of G.units) {
    if (u.dead && u.kind !== 'hero' && u.kind !== 'monster') continue;
    u.atkCd = Math.max(0, u.atkCd - dt);
    if (u.stunT > 0) u.stunT -= dt;
    if (u.rootT > 0) u.rootT -= dt;
    if (u.slowT > 0) { u.slowT -= dt; if (u.slowT <= 0) u.slowP = 0; }
    if (u.kind === 'hero') {
      if (!u.dead) { u.gold += 3 * dt; u.goldTotal += 3 * dt; if (u.level < D.MAX_LEVEL) gainXp(u, 2.5 * dt); }
      const px = u.x, py = u.y;
      updateHero(u, dt);
      u.vx = u.vx * 0.7 + (u.x - px) / dt * 0.3; u.vy = u.vy * 0.7 + (u.y - py) / dt * 0.3;
    } else if (u.kind === 'minion') {
      const base = D.MINION[u.mtype].ms;
      u.ms = base * (1 - (u.slowT > 0 ? u.slowP : 0));
      updateMinion(u, dt);
    } else if (u.kind === 'monster') updateMonster(u, dt);
    else updateStructure(u);
    if (G.over) return;
  }
  updateProjectiles(dt);
  updateZones(dt);
  separate();
  updateVisibility();
  G.units = G.units.filter(u => !(u.kind === 'minion' && u.dead && G.t - u.deathT > 0.7));
  G.minions = G.units.filter(u => u.kind === 'minion');
  G.buyTimer -= dt;
  if (G.buyTimer <= 0) { G.buyTimer = 0.5; autoBuy(); }
}

LF.sim = {
  createGame, update, cast, startRecall, canBuy, purchasePlan, nextRecommended, nextPurchase, SELL_RATE, pickAttackTarget, isTargetable, isStructure, validFoe, seen,
  dist, gap, clamp, rand, moveToward, emptyInput, skillValue, hasBuff, enemyUnitsNear,
  get G() { return G; },
};
})(window.LF);
