// Lanefall: a one-lane MOBA. You (Lumen, blue) versus an AI hero (Vex, red).
// Plain canvas + DOM, no dependencies.
(() => {
'use strict';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
const W = 3600, H = 1200, LANE_Y = 600;
const BOUNDS = { x0: 40, x1: W - 40, y0: LANE_Y - 330, y1: LANE_Y + 330 };
const BLUE = 0, RED = 1;
const TAU = Math.PI * 2;
const TEAM = [
  { name: 'Blue', color: '#4fa3ff', deep: '#163a63', light: '#cfe7ff', rgb: '79,163,255' },
  { name: 'Red', color: '#ff5a4e', deep: '#5e1914', light: '#ffd6cf', rgb: '255,90,78' },
];
const GOLD = '#f2c14e', HEAL = '#7be38a';
const FOUNTAINS = [{ x: 140, y: LANE_Y, r: 200 }, { x: W - 140, y: LANE_Y, r: 200 }];
const WAVE_INTERVAL = 30, FIRST_WAVE = 3, PASSIVE_GOLD = 2;

const HERO = { hp: 640, hpLvl: 95, mana: 320, manaLvl: 40, ad: 54, adLvl: 4.5, range: 340, atkSpeed: 0.75, speed: 315, hpRegen: 3, manaRegen: 5, r: 22 };
const MAX_LEVEL = 12;
const xpToNext = lvl => 90 + lvl * 55;

const ABILITIES = {
  Q: { name: 'Arc Bolt', cd: 5, mana: 50, range: 820, desc: 'Fire a bolt in a line that hits the first enemy.' },
  W: { name: 'Blink', cd: 12, mana: 60, range: 330, desc: 'Teleport a short distance.' },
  E: { name: 'Mend', cd: 14, mana: 80, desc: 'Restore health instantly.' },
  R: { name: 'Starfall', cd: 55, mana: 120, range: 760, radius: 190, unlock: 3, desc: 'Call a star down on an area after a short delay. Unlocks at level 3.' },
};
const KEYS = ['Q', 'W', 'E', 'R'];
const qDamage = h => 70 + 28 * h.level + 0.5 * h.ad;
const rDamage = h => 180 + 50 * h.level + 0.8 * h.ad;
const eHeal = h => 90 + 28 * h.level;

const ITEMS = [
  { id: 'blade', name: 'Longsword', tag: 'LS', cost: 350, ad: 15, text: '+15 attack damage' },
  { id: 'ruby', name: 'Ruby Crystal', tag: 'RC', cost: 400, hp: 220, text: '+220 max health' },
  { id: 'focus', name: 'Sapphire Focus', tag: 'SF', cost: 350, mana: 160, manaRegen: 3, text: '+160 mana, +3 mana per second' },
  { id: 'boots', name: 'Swift Boots', tag: 'SB', cost: 300, speed: 55, unique: true, text: '+55 move speed. Limit one.' },
  { id: 'glass', name: 'Quickglass', tag: 'QG', cost: 650, haste: 0.2, unique: true, text: 'Abilities recharge 20% faster. Limit one.' },
];
const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const MAX_ITEMS = 6;
const AI_BUILD = ['boots', 'blade', 'ruby', 'blade', 'glass', 'ruby', 'blade'];

const MINION = {
  melee: { hp: 320, ad: 13, range: 26, atkSpeed: 1, speed: 95, r: 12, gold: 21, xp: 32, ranged: false },
  caster: { hp: 220, ad: 20, range: 290, atkSpeed: 0.8, speed: 95, r: 10, gold: 15, xp: 26, ranged: true, projSpeed: 650 },
  // Every third wave brings a siege minion that hits structures twice as hard.
  siege: { hp: 760, ad: 42, range: 310, atkSpeed: 0.6, speed: 90, r: 15, gold: 50, xp: 60, ranged: true, projSpeed: 600, siege: 2 },
};
const TOWER = { hp: 2600, ad: 115, range: 390, atkSpeed: 0.85, r: 34, projSpeed: 900 };
const NEXUS = { hp: 4500, r: 56 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const gap = (a, b) => dist(a, b) - a.r - b.r;
const fwd = team => (team === BLUE ? 1 : -1);
const clampX = x => clamp(x, BOUNDS.x0, BOUNDS.x1);
const clampY = y => clamp(y, BOUNDS.y0, BOUNDS.y1);
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
let G = null;
let uid = 0;
const cam = { x: 0, y: 0 };

function unit(o) {
  return Object.assign({
    id: ++uid, dead: false, x: 0, y: 0, vx: 0, vy: 0, r: 10, hp: 1, maxHp: 1,
    ad: 0, range: 0, atkSpeed: 1, atkTimer: 0, speed: 0, target: null,
    facing: 0, flash: 0, swing: 0, ranged: false,
  }, o);
}

function newGame(demo) {
  uid = 0;
  G = {
    demo, t: 0, units: [], heroes: [], projectiles: [], effects: [], texts: [],
    nextWave: FIRST_WAVE, wave: 0, over: false, winner: -1, overT: 0, kills: [0, 0],
  };
  for (const team of [BLUE, RED]) {
    const at = d => (team === BLUE ? d : W - d);
    const towerY = LANE_Y - 105 * fwd(team);
    const nexus = unit({ kind: 'structure', type: 'nexus', team, x: at(380), y: LANE_Y, r: NEXUS.r, hp: NEXUS.hp, maxHp: NEXUS.hp });
    const tower = d => unit({
      kind: 'structure', type: 'tower', team, x: at(d), y: towerY, r: TOWER.r,
      hp: TOWER.hp, maxHp: TOWER.hp, ad: TOWER.ad, range: TOWER.range,
      atkSpeed: TOWER.atkSpeed, ranged: true, projSpeed: TOWER.projSpeed,
    });
    const inner = tower(760), outer = tower(1180);
    nexus.guardedBy = inner;
    inner.guardedBy = outer;
    G.units.push(nexus, inner, outer);
  }
  G.heroes = [makeHero(BLUE, 'Lumen', true, demo), makeHero(RED, 'Vex', false, true)];
  G.units.push(...G.heroes);
  G.player = G.heroes[BLUE];
  cam.x = G.player.x; cam.y = G.player.y;
}

function makeHero(team, name, isPlayer, ai) {
  const f = FOUNTAINS[team];
  const h = unit({
    kind: 'hero', team, name, isPlayer, ai, x: f.x, y: f.y, r: HERO.r, ranged: true, projSpeed: 1100,
    level: 1, xp: 0, gold: 500, items: [], cds: { Q: 0, W: 0, E: 0, R: 0 },
    respawn: 0, kills: 0, deaths: 0, cs: 0, moveTo: null, attackTarget: null,
    facing: team === BLUE ? 0 : Math.PI, maxHp: 0, maxMana: 0, mana: 0,
    aiTimer: 0, aiState: 'lane', buildIdx: 0,
  });
  recalcHero(h, true);
  return h;
}

function recalcHero(h, reset) {
  const L = h.level - 1;
  const s = {
    hp: HERO.hp + HERO.hpLvl * L, mana: HERO.mana + HERO.manaLvl * L, ad: HERO.ad + HERO.adLvl * L,
    speed: HERO.speed, manaRegen: HERO.manaRegen, haste: 0,
  };
  for (const id of h.items) {
    const it = ITEM[id];
    for (const k of Object.keys(s)) s[k] += it[k] || 0;
  }
  if (reset) { h.hp = s.hp; h.mana = s.mana; }
  else { h.hp += Math.max(0, s.hp - h.maxHp); h.mana += Math.max(0, s.mana - h.maxMana); }
  h.maxHp = s.hp; h.maxMana = s.mana; h.ad = s.ad; h.speed = s.speed;
  h.manaRegen = s.manaRegen; h.haste = s.haste;
  h.hpRegen = HERO.hpRegen + L * 0.4;
  h.range = HERO.range;
  h.atkSpeed = HERO.atkSpeed + L * 0.02;
}

function spawnWave() {
  G.wave++;
  const k = 1 + 0.05 * (G.wave - 1);
  const layout = [['melee', 150, -34], ['melee', 150, 0], ['melee', 150, 34], ['caster', 100, -22], ['caster', 100, 22]];
  if (G.wave % 3 === 0) layout.push(['siege', 75, 0]);
  for (const team of [BLUE, RED]) {
    const nexus = G.units.find(u => u.type === 'nexus' && u.team === team);
    if (nexus.dead) continue;
    const d = fwd(team);
    for (const [type, off, dy] of layout) {
      const s = MINION[type];
      G.units.push(unit({
        kind: 'minion', type, team, x: nexus.x + d * off, y: LANE_Y + dy, r: s.r,
        hp: s.hp * k, maxHp: s.hp * k, ad: s.ad * k, range: s.range, atkSpeed: s.atkSpeed,
        speed: s.speed, ranged: s.ranged, projSpeed: s.projSpeed, gold: s.gold, xp: s.xp,
        laneOffset: dy * 0.8, facing: d > 0 ? 0 : Math.PI, siege: s.siege || 1,
      }));
    }
  }
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
const isTargetable = u => !!u && !u.dead && (!u.guardedBy || u.guardedBy.dead);

function update(dt) {
  G.t += dt;
  if (G.t >= G.nextWave) { spawnWave(); G.nextWave += WAVE_INTERVAL; }
  for (const u of G.units) {
    if (u.dead && u.kind !== 'hero') continue;
    const px = u.x, py = u.y;
    u.atkTimer = Math.max(0, u.atkTimer - dt);
    u.flash = Math.max(0, u.flash - dt);
    u.swing = Math.max(0, u.swing - dt);
    if (u.kind === 'minion') updateMinion(u, dt);
    else if (u.type === 'tower') updateTower(u);
    else if (u.kind === 'hero') updateHero(u, dt);
    u.vx = (u.x - px) / dt; u.vy = (u.y - py) / dt;
    if (G.over) return;
  }
  separate();
  updateProjectiles(dt);
  updateEffects(dt);
  updateTexts(dt);
  G.units = G.units.filter(u => !(u.dead && u.kind === 'minion'));
}

function moveToward(u, tx, ty, dt) {
  let dx = tx - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) return true;
  dx /= d; dy /= d;
  // Steer around structures standing in the way.
  for (const s of G.units) {
    if (s.kind !== 'structure' || s.dead || s === u.attackTarget || s === u.target) continue;
    const rx = s.x - u.x, ry = s.y - u.y;
    const along = rx * dx + ry * dy;
    if (along <= 0 || along > Math.min(d, 170)) continue;
    const side = -rx * dy + ry * dx; // offset of the obstacle from our path
    const clear = s.r + u.r + 8;
    if (Math.abs(side) < clear) {
      const k = (side >= 0 ? -1 : 1) * (1 - Math.abs(side) / clear) * 1.6;
      const px = -dy, py = dx;
      dx += px * k; dy += py * k;
      const n = Math.hypot(dx, dy); dx /= n; dy /= n;
    }
  }
  const step = Math.min(d, u.speed * dt);
  u.x = clampX(u.x + dx * step);
  u.y = clampY(u.y + dy * step);
  u.facing = Math.atan2(dy, dx);
  return step >= d;
}

function acquire(u, radius, noHeroes) {
  let best = null, bestScore = Infinity;
  for (const o of G.units) {
    if (o.team === u.team || !isTargetable(o)) continue;
    if (noHeroes && o.kind === 'hero') continue;
    const g = gap(u, o);
    if (g > radius) continue;
    const score = g + (o.kind === 'hero' ? 120 : 0) + (o.kind === 'structure' ? 60 : 0);
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

function tryAttack(u, t) {
  u.facing = Math.atan2(t.y - u.y, t.x - u.x);
  if (u.atkTimer > 0) return;
  u.atkTimer = 1 / u.atkSpeed;
  u.swing = 0.18;
  if (u.ranged) {
    const oy = u.type === 'tower' ? -80 : 0;
    G.projectiles.push({
      kind: 'auto', x: u.x + Math.cos(u.facing) * u.r * 0.8, y: u.y + oy + Math.sin(u.facing) * u.r * 0.8,
      target: t, src: u, dmg: u.ad, speed: u.projSpeed || 800, team: u.team, style: u.type === 'tower' ? 'tower' : u.kind,
    });
  } else {
    dealDamage(u, t, u.ad);
  }
}

function updateMinion(m, dt) {
  if (m.target && !(isTargetable(m.target) && m.target.team !== m.team && gap(m, m.target) <= 460)) m.target = null;
  if (!m.target) m.target = acquire(m, 340);
  const t = m.target;
  if (t) {
    if (gap(m, t) <= m.range) tryAttack(m, t);
    else moveToward(m, t.x, t.y, dt);
  } else {
    moveToward(m, m.x + fwd(m.team) * 60, LANE_Y + m.laneOffset, dt);
  }
}

function updateTower(t) {
  const tg = t.target;
  if (tg && !(isTargetable(tg) && tg.team !== t.team && gap(t, tg) <= t.range)) t.target = null;
  if (!t.target) {
    let best = null, bestScore = Infinity;
    for (const o of G.units) {
      if (o.team === t.team || !isTargetable(o) || o.kind === 'structure') continue;
      const g = gap(t, o);
      if (g > t.range) continue;
      const score = g + (o.kind === 'hero' ? 10000 : 0); // minions first
      if (score < bestScore) { bestScore = score; best = o; }
    }
    t.target = best;
  }
  if (t.target) tryAttack(t, t.target);
}

function updateHero(h, dt) {
  if (h.dead) {
    h.respawn -= dt;
    if (h.respawn <= 0) respawn(h);
    return;
  }
  for (const k of KEYS) h.cds[k] = Math.max(0, h.cds[k] - dt);
  h.gold += PASSIVE_GOLD * dt;
  h.hp = Math.min(h.maxHp, h.hp + h.hpRegen * dt);
  h.mana = Math.min(h.maxMana, h.mana + h.manaRegen * dt);

  const own = FOUNTAINS[h.team], foe = FOUNTAINS[1 - h.team];
  if (dist(h, own) < own.r) {
    h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.15 * dt);
    h.mana = Math.min(h.maxMana, h.mana + h.maxMana * 0.2 * dt);
  }
  if (dist(h, foe) < foe.r) {
    dealDamage(null, h, 700 * dt, true);
    if (h.dead) return;
  }

  if (h.ai) {
    h.aiTimer -= dt;
    if (h.aiTimer <= 0) { h.aiTimer = 0.2; aiThink(h); }
  }

  const t = h.attackTarget;
  if (t && !(isTargetable(t) && t.team !== h.team)) h.attackTarget = null;
  if (h.attackTarget) {
    const tg = h.attackTarget;
    if (gap(h, tg) <= h.range) tryAttack(h, tg);
    else moveToward(h, tg.x, tg.y, dt);
  } else if (h.moveTo) {
    if (moveToward(h, h.moveTo.x, h.moveTo.y, dt)) h.moveTo = null;
  } else if (!h.ai && h.atkTimer <= 0) {
    // Idle: auto-attack nearby minions and structures, never heroes.
    const tg = acquire(h, h.range, true);
    if (tg) tryAttack(h, tg);
  }
}

function respawn(h) {
  const f = FOUNTAINS[h.team];
  h.dead = false;
  h.x = f.x + fwd(h.team) * 30; h.y = f.y;
  h.hp = h.maxHp; h.mana = h.maxMana;
  h.moveTo = null; h.attackTarget = null; h.aiState = 'lane';
  ring(h.x, h.y, h.r, 70, TEAM[h.team].color, 0.6, h);
}

function separate() {
  const movers = [], solids = [];
  for (const u of G.units) {
    if (u.dead) continue;
    (u.kind === 'structure' ? solids : movers).push(u);
  }
  for (let i = 0; i < movers.length; i++) {
    const a = movers[i];
    for (let j = i + 1; j < movers.length; j++) {
      const b = movers[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.r + b.r;
      if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d >= min) continue;
      const ma = a.kind === 'hero' ? 3 : 1, mb = b.kind === 'hero' ? 3 : 1;
      const push = (min - d) * 0.5;
      const nx = dx / d, ny = dy / d;
      a.x -= nx * push * (mb / (ma + mb)) * 2; a.y -= ny * push * (mb / (ma + mb)) * 2;
      b.x += nx * push * (ma / (ma + mb)) * 2; b.y += ny * push * (ma / (ma + mb)) * 2;
    }
  }
  for (const m of movers) {
    for (const s of solids) {
      const dx = m.x - s.x, dy = m.y - s.y;
      const min = m.r + s.r;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 0.01) { m.y += min; continue; }
      m.x = s.x + dx / d * min; m.y = s.y + dy / d * min;
    }
    m.x = clampX(m.x); m.y = clampY(m.y);
  }
}

function updateProjectiles(dt) {
  for (const p of G.projectiles) {
    if (p.kind === 'auto') {
      const t = p.target;
      if (t.dead) { p.done = true; continue; }
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= step + t.r * 0.5) { p.done = true; dealDamage(p.src, t, t.kind === 'structure' ? p.dmg * (p.src.siege || 1) : p.dmg); }
      else { p.x += dx / d * step; p.y += dy / d * step; }
    } else if (p.kind === 'bolt') {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.travelled += p.speed * dt;
      for (const o of G.units) {
        if (o.team === p.team || o.dead || o.kind === 'structure') continue;
        if (dist(p, o) < o.r + p.r) {
          dealDamage(p.src, o, p.dmg, false, 'skill');
          burst(p.x, p.y, TEAM[p.team].light, 12, 220);
          p.done = true;
          break;
        }
      }
      if (p.travelled >= p.max) { p.done = true; burst(p.x, p.y, TEAM[p.team].color, 5, 90); }
    }
  }
  G.projectiles = G.projectiles.filter(p => !p.done);
}

function dealDamage(src, tgt, amt, silent, type) {
  if (tgt.dead || amt <= 0) return;
  tgt.hp -= amt;
  tgt.flash = 0.1;
  if (src && src.kind === 'hero') { tgt.lastHeroHit = src; tgt.lastHeroHitT = G.t; }
  if (!silent && (tgt.kind === 'hero' || (src && src.isPlayer && !G.demo))) {
    const color = tgt.isPlayer ? '#ff8a7e' : type === 'skill' ? '#d2b8ff' : '#ffffff';
    addText(tgt.x + rand(-10, 10), tgt.y - tgt.r - 16, Math.round(amt), color, type === 'skill' ? 24 : 19);
  }
  if (src && src.kind === 'hero' && tgt.kind === 'hero') callForHelp(tgt.team, src);
  if (tgt.hp <= 0) kill(tgt, src);
}

// When a hero hits an enemy hero, nearby towers and minions turn on the attacker.
function callForHelp(team, attacker) {
  for (const u of G.units) {
    if (u.dead || u.team !== team) continue;
    if (u.type === 'tower' && gap(u, attacker) <= u.range) u.target = attacker;
    else if (u.kind === 'minion' && dist(u, attacker) < 420) u.target = attacker;
  }
}

function kill(u, killer) {
  u.dead = true; u.hp = 0;
  burst(u.x, u.y, TEAM[u.team].color, u.kind === 'minion' ? 8 : 26, u.kind === 'minion' ? 120 : 220);
  const foes = G.heroes.filter(h => h.team !== u.team && !h.dead);
  const killerHero = killer && killer.kind === 'hero' ? killer : null;
  const you = !G.demo;

  if (u.kind === 'minion') {
    if (killerHero) {
      killerHero.gold += u.gold; killerHero.cs++;
      if (killerHero.isPlayer && you) addText(u.x, u.y - 20, '+' + u.gold, GOLD, 20);
    }
    for (const h of foes) if (dist(h, u) < 900) gainXp(h, u.xp);
  } else if (u.kind === 'hero') {
    u.deaths++;
    u.respawn = 6 + u.level * 2;
    u.moveTo = null; u.attackTarget = null;
    G.kills[1 - u.team]++;
    const credit = killerHero || (u.lastHeroHit && G.t - u.lastHeroHitT < 8 ? u.lastHeroHit : null);
    if (credit) {
      credit.kills++; credit.gold += 300;
      if (credit.isPlayer && you) addText(u.x, u.y - 40, '+300', GOLD, 26);
    }
    for (const h of foes) if (dist(h, u) < 1100) gainXp(h, 110 + 25 * u.level);
    if (you) announce(u.isPlayer ? 'You have been slain' : 'Enemy slain', u.isPlayer ? 'red' : 'blue');
  } else if (u.type === 'tower') {
    for (const h of G.heroes) if (h.team !== u.team) h.gold += 200;
    shake(10);
    if (you) announce(u.team === G.player.team ? 'Your tower has fallen' : 'Enemy tower destroyed', u.team === G.player.team ? 'red' : 'blue');
  } else if (u.type === 'nexus') {
    shake(22);
    burst(u.x, u.y - 40, TEAM[u.team].light, 60, 380);
    G.over = true; G.winner = 1 - u.team; G.overT = 0;
  }
}

function gainXp(h, amt) {
  if (h.level >= MAX_LEVEL) return;
  h.xp += amt;
  while (h.level < MAX_LEVEL && h.xp >= xpToNext(h.level)) {
    h.xp -= xpToNext(h.level);
    h.level++;
    recalcHero(h, false);
    ring(h.x, h.y, h.r, 90, GOLD, 0.7, h);
    if (h.isPlayer && !G.demo) {
      addText(h.x, h.y - 56, 'Level ' + h.level, GOLD, 26);
      if (h.level === ABILITIES.R.unlock) announce('Starfall is ready. Press R.', 'gold');
    }
  }
  if (h.level >= MAX_LEVEL) h.xp = 0;
}

function buy(h, id) {
  const it = ITEM[id];
  if (h.gold < it.cost || h.items.length >= MAX_ITEMS || (it.unique && h.items.includes(id))) return false;
  h.gold -= it.cost;
  h.items.push(id);
  recalcHero(h, false);
  return true;
}
const canShop = h => h.dead || dist(h, FOUNTAINS[h.team]) < FOUNTAINS[h.team].r;

// Returns '' on success, otherwise the reason it failed.
function castAbility(h, key, tx, ty) {
  const a = ABILITIES[key];
  if (h.dead) return 'dead';
  if (key === 'R' && h.level < a.unlock) return 'locked';
  if (h.cds[key] > 0) return 'cooldown';
  if (h.mana < a.mana) return 'mana';
  let ang = Math.atan2(ty - h.y, tx - h.x);
  if (!isFinite(ang) || (tx === h.x && ty === h.y)) ang = h.facing;
  const tm = TEAM[h.team];

  if (key === 'Q') {
    const speed = 1150;
    G.projectiles.push({
      kind: 'bolt', x: h.x + Math.cos(ang) * h.r, y: h.y + Math.sin(ang) * h.r,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed, travelled: 0, max: a.range,
      r: 14, dmg: qDamage(h), team: h.team, src: h,
    });
    h.facing = ang;
  } else if (key === 'W') {
    const d = clamp(Math.hypot(tx - h.x, ty - h.y), 120, a.range);
    const x0 = h.x, y0 = h.y;
    h.x = clampX(h.x + Math.cos(ang) * d);
    h.y = clampY(h.y + Math.sin(ang) * d);
    h.facing = ang;
    if (h.moveTo && dist(h, h.moveTo) < 40) h.moveTo = null;
    G.effects.push({ kind: 'blink', x0, y0, x1: h.x, y1: h.y, t: 0, life: 0.35, color: tm.light });
    burst(x0, y0, tm.color, 10, 120);
    burst(h.x, h.y, tm.light, 10, 120);
  } else if (key === 'E') {
    const amt = Math.min(eHeal(h), h.maxHp - h.hp);
    h.hp += amt;
    ring(h.x, h.y, h.r, 60, HEAL, 0.5, h);
    burst(h.x, h.y, HEAL, 12, 90);
    if (!G.demo && (h.isPlayer || dist(h, G.player) < 900)) addText(h.x, h.y - 40, '+' + Math.round(amt), HEAL, 22);
  } else if (key === 'R') {
    let d = Math.hypot(tx - h.x, ty - h.y);
    if (!isFinite(d)) d = 0;
    d = Math.min(d, a.range);
    G.effects.push({
      kind: 'star', x: clampX(h.x + Math.cos(ang) * d), y: clampY(h.y + Math.sin(ang) * d),
      r: a.radius, t: 0, delay: 0.75, life: 1.25, team: h.team, src: h, dmg: rDamage(h), fired: false,
    });
  }
  h.mana -= a.mana;
  h.cds[key] = a.cd * (1 - h.haste);
  return '';
}

// ---------------------------------------------------------------------------
// Enemy AI. Works for either team (the title screen runs AI against AI).
// ---------------------------------------------------------------------------
function nearestEnemyStructure(h) {
  let best = null, bd = Infinity;
  for (const u of G.units) {
    if (u.kind !== 'structure' || u.dead || u.team === h.team) continue;
    const d = dist(h, u);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

function goTo(h, x, y) {
  h.attackTarget = null;
  h.moveTo = { x: clampX(x), y: clampY(y) };
}

function aiThink(h) {
  const foe = G.heroes[1 - h.team];
  const home = FOUNTAINS[h.team];
  const dir = fwd(h.team);
  const hpPct = h.hp / h.maxHp;
  const atHome = dist(h, home) < home.r - 30;

  if (atHome) {
    while (h.buildIdx < AI_BUILD.length && buy(h, AI_BUILD[h.buildIdx])) h.buildIdx++;
  }

  if (h.aiState === 'recall') {
    if (atHome && hpPct > 0.95 && h.mana > h.maxMana * 0.7) h.aiState = 'lane';
    else {
      goTo(h, home.x, home.y);
      if (!foe.dead && dist(h, foe) < 380 && hpPct < 0.35) castAbility(h, 'W', home.x, home.y);
      return;
    }
  }
  if (hpPct < 0.3 || (h.mana < 40 && hpPct < 0.5)) {
    h.aiState = 'recall';
    castAbility(h, 'E', h.x, h.y);
    goTo(h, home.x, home.y);
    return;
  }
  if (hpPct < 0.55) castAbility(h, 'E', h.x, h.y);

  const tower = nearestEnemyStructure(h);
  const towerBusy = tower && tower.type === 'tower' && tower.target && tower.target.kind === 'minion';
  const safe = p => !tower || towerBusy || (foe.dead && hpPct > 0.5) || dist(p, tower) > tower.range + tower.r + h.r + 40;

  if (!foe.dead) {
    const d = dist(h, foe);
    const foePct = foe.hp / foe.maxHp;
    const foeUnderTower = tower && tower.type === 'tower' && dist(foe, tower) < tower.range + tower.r + 10;
    if (d < ABILITIES.Q.range - 40 && Math.random() < 0.55) {
      const tt = d / 1150;
      castAbility(h, 'Q', foe.x + foe.vx * tt * rand(0.6, 1.1), foe.y + foe.vy * tt * rand(0.6, 1.1));
    }
    if (d < ABILITIES.R.range && foePct < 0.5 && !foeUnderTower) {
      castAbility(h, 'R', foe.x + foe.vx * 0.45, foe.y + foe.vy * 0.45);
    }
    const winning = hpPct > foePct + 0.1 || foePct < 0.3;
    if (winning && d < 560 && !foeUnderTower) {
      if (foePct < 0.25 && d > h.range + 60) castAbility(h, 'W', foe.x, foe.y);
      h.attackTarget = foe; h.moveTo = null;
      return;
    }
    if (!winning && d < h.range && hpPct < 0.6) {
      const a = Math.atan2(h.y - foe.y, h.x - foe.x);
      goTo(h, h.x + Math.cos(a) * 160, h.y + Math.sin(a) * 160);
      return;
    }
  }

  // Farm: hit the weakest enemy minion that is safe to reach.
  let best = null;
  for (const m of G.units) {
    if (m.kind !== 'minion' || m.dead || m.team === h.team) continue;
    if (dist(h, m) > 600 || !safe(m)) continue;
    if (!best || m.hp < best.hp) best = m;
  }
  if (best) { h.attackTarget = best; h.moveTo = null; return; }

  // Siege when our minions are tanking the tower, or the nexus is open.
  const minionsAtTower = tower && G.units.some(m => m.kind === 'minion' && !m.dead && m.team === h.team && dist(m, tower) < tower.range + 60);
  if (tower && isTargetable(tower) && (towerBusy || tower.type === 'nexus' || (foe.dead && minionsAtTower && hpPct > 0.5)) && dist(h, tower) < 750) {
    h.attackTarget = tower; h.moveTo = null;
    return;
  }

  // Otherwise stand behind our front minion, or by our front tower.
  let front = null;
  for (const m of G.units) {
    if (m.kind === 'minion' && !m.dead && m.team === h.team && (!front || m.x * dir > front.x * dir)) front = m;
  }
  let anchorX;
  if (front) anchorX = front.x - dir * 140;
  else {
    let mine = null;
    for (const s of G.units) {
      if (s.kind === 'structure' && !s.dead && s.team === h.team && (!mine || s.x * dir > mine.x * dir)) mine = s;
    }
    anchorX = (mine ? mine.x : home.x) - dir * 60;
  }
  const p = { x: anchorX, y: LANE_Y + 45 * dir };
  if (!safe(p)) p.x = tower.x - dir * (tower.range + tower.r + h.r + 60);
  goTo(h, p.x, p.y);
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
function ring(x, y, r0, r1, color, life, follow) {
  G.effects.push({ kind: 'ring', x, y, r0, r1, color, t: 0, life, follow });
}
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(0.3, 1) * speed;
    G.effects.push({ kind: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, t: 0, life: rand(0.35, 0.75), color, size: rand(2, 5) });
  }
}
function addText(x, y, text, color, size) {
  G.texts.push({ x, y, text: String(text), color, size, t: 0, life: 0.9 });
}
let shakeAmt = 0;
function shake(n) { shakeAmt = Math.max(shakeAmt, n); }

function updateEffects(dt) {
  for (const e of G.effects) {
    e.t += dt;
    if (e.kind === 'p') { e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.92; e.vy *= 0.92; }
    else if (e.kind === 'ring' && e.follow) { e.x = e.follow.x; e.y = e.follow.y; }
    else if (e.kind === 'star' && !e.fired && e.t >= e.delay) {
      e.fired = true;
      for (const o of G.units) {
        if (o.team === e.team || o.dead || o.kind === 'structure') continue;
        if (dist(e, o) < e.r + o.r) dealDamage(e.src, o, e.dmg, false, 'skill');
      }
      burst(e.x, e.y, GOLD, 26, 320);
      burst(e.x, e.y, TEAM[e.team].light, 14, 200);
      ring(e.x, e.y, 20, e.r * 1.15, GOLD, 0.45);
      shake(6);
    }
  }
  G.effects = G.effects.filter(e => e.t < e.life);
}
function updateTexts(dt) {
  for (const t of G.texts) { t.t += dt; t.y -= 42 * dt; }
  G.texts = G.texts.filter(t => t.t < t.life);
}

// ---------------------------------------------------------------------------
// Terrain (drawn once)
// ---------------------------------------------------------------------------
function buildTerrain() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry32(11);

  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#16261a'); base.addColorStop(0.3, '#284427');
  base.addColorStop(0.5, '#2f4d2c'); base.addColorStop(0.7, '#284427'); base.addColorStop(1, '#16261a');
  g.fillStyle = base; g.fillRect(0, 0, W, H);

  for (let i = 0; i < 2400; i++) {
    const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 70;
    g.fillStyle = rnd() < 0.5 ? `rgba(70,110,55,${0.05 + rnd() * 0.08})` : `rgba(15,30,18,${0.06 + rnd() * 0.1})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  g.lineWidth = 1.4; g.lineCap = 'round';
  for (let i = 0; i < 16000; i++) {
    const x = rnd() * W, y = rnd() * H, l = 3 + rnd() * 6;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(120,160,80,0.22)' : 'rgba(20,40,20,0.3)';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - l); g.stroke();
  }

  // The lane: a worn dirt road.
  const lanePts = [];
  for (let x = 160; x <= W - 160; x += 90) lanePts.push([x, LANE_Y + Math.sin(x * 0.004) * 14 + (rnd() - 0.5) * 10]);
  const strokeLane = (w, color) => {
    g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); lanePts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  };
  strokeLane(330, 'rgba(60,50,32,0.45)');
  strokeLane(280, '#5b4b33');
  strokeLane(236, '#6d5a3d');
  strokeLane(150, 'rgba(140,118,82,0.35)');
  for (let i = 0; i < 2600; i++) {
    const x = 160 + rnd() * (W - 320), y = LANE_Y + (rnd() - 0.5) * 250;
    g.fillStyle = rnd() < 0.5 ? 'rgba(40,30,18,0.35)' : 'rgba(170,150,110,0.25)';
    g.fillRect(x, y, 2 + rnd() * 3, 2 + rnd() * 2);
  }

  // River crossing the middle; the lane fords it.
  const river = (w, color) => {
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(1690, -20);
    g.bezierCurveTo(1880, 300, 1700, 800, 1910, H + 20);
    g.stroke();
  };
  river(210, '#1f3f3a'); river(176, '#245866'); river(120, '#2c6b7c');
  g.save(); g.globalAlpha = 0.45; strokeLane(236, '#7b6a4c'); g.restore();
  g.strokeStyle = 'rgba(190,230,240,0.18)'; g.lineWidth = 2;
  for (let i = 0; i < 70; i++) {
    const t = rnd(), y = t * H, x = 1690 + (1910 - 1690) * t + Math.sin(t * 7) * 60 + (rnd() - 0.5) * 80;
    g.beginPath(); g.moveTo(x - 14, y); g.quadraticCurveTo(x, y - 5, x + 14, y); g.stroke();
  }

  // Base platforms.
  for (const team of [BLUE, RED]) {
    const cx = team === BLUE ? 270 : W - 270;
    const tm = TEAM[team];
    g.fillStyle = '#3c4146';
    g.beginPath(); g.arc(cx, LANE_Y, 340, 0, TAU); g.fill();
    g.fillStyle = '#4a5056';
    g.beginPath(); g.arc(cx, LANE_Y, 320, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let r = 80; r < 320; r += 60) { g.beginPath(); g.arc(cx, LANE_Y, r, 0, TAU); g.stroke(); }
    for (let a = 0; a < 24; a++) {
      const an = a / 24 * TAU;
      g.beginPath(); g.moveTo(cx + Math.cos(an) * 80, LANE_Y + Math.sin(an) * 80);
      g.lineTo(cx + Math.cos(an) * 320, LANE_Y + Math.sin(an) * 320); g.stroke();
    }
    g.strokeStyle = `rgba(${tm.rgb},0.35)`; g.lineWidth = 6;
    g.beginPath(); g.arc(cx, LANE_Y, 330, 0, TAU); g.stroke();
    const f = FOUNTAINS[team];
    const fg = g.createRadialGradient(f.x, f.y, 10, f.x, f.y, f.r);
    fg.addColorStop(0, `rgba(${tm.rgb},0.45)`); fg.addColorStop(1, `rgba(${tm.rgb},0.04)`);
    g.fillStyle = fg; g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.fill();
    g.fillStyle = '#6a7178'; g.beginPath(); g.arc(f.x, f.y, 34, 0, TAU); g.fill();
    g.fillStyle = tm.color; g.beginPath(); g.arc(f.x, f.y, 22, 0, TAU); g.fill();
  }

  // Jungle walls: tree canopies above and below the walkable band.
  const trees = [];
  for (let i = 0; i < 420; i++) {
    const x = rnd() * W;
    const top = rnd() < 0.5;
    const y = top ? rnd() * (BOUNDS.y0 - 10) : BOUNDS.y1 + 10 + rnd() * (H - BOUNDS.y1);
    trees.push([x, y, 26 + rnd() * 34]);
  }
  trees.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r] of trees) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(x + 8, y + r * 0.55, r * 1.05, r * 0.6, 0, 0, TAU); g.fill();
    const shades = ['#14301b', '#1b3d22', '#24502b'];
    for (let k = 0; k < 3; k++) {
      g.fillStyle = shades[k];
      g.beginPath(); g.arc(x - k * 4, y - k * 5, r * (1 - k * 0.22), 0, TAU); g.fill();
    }
  }
  // A few rocks on the lane edges.
  for (let i = 0; i < 60; i++) {
    const x = 400 + rnd() * (W - 800), y = LANE_Y + (rnd() < 0.5 ? -1 : 1) * (150 + rnd() * 150), r = 6 + rnd() * 10;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 3, y + 4, r, r * 0.6, 0, 0, TAU); g.fill();
    g.fillStyle = '#6d7068'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = '#8b8e85'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, TAU); g.fill();
  }
  return c;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const view = document.getElementById('view');
const ctx = view.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
let cw = 0, ch = 0, dpr = 1, scale = 1;
const terrain = buildTerrain();
const miniTerrain = (() => {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 160;
  c.getContext('2d').drawImage(terrain, 0, 0, c.width, c.height);
  return c;
})();

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = view.clientWidth; ch = view.clientHeight;
  view.width = Math.round(cw * dpr); view.height = Math.round(ch * dpr);
  scale = clamp(Math.min(cw / 900, ch / 680), 0.42, 1.25);
  mini.width = Math.round(mini.clientWidth * dpr); mini.height = Math.round(mini.clientHeight * dpr);
}

function updateCamera(dt) {
  const p = G.player;
  const f = p.dead ? FOUNTAINS[p.team] : p;
  const k = 1 - Math.exp(-dt * 8);
  cam.x += (f.x - cam.x) * k; cam.y += (f.y - cam.y) * k;
  const vw = cw / scale, vh = ch / scale;
  cam.x = vw >= W ? W / 2 : clamp(cam.x, vw / 2, W - vw / 2);
  cam.y = vh >= H ? H / 2 : clamp(cam.y, vh / 2, H - vh / 2);
  shakeAmt = Math.max(0, shakeAmt - dt * 40);
}

const screenToWorld = (sx, sy) => ({ x: (sx - cw / 2) / scale + cam.x, y: (sy - ch / 2) / scale + cam.y });

function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function poly(x, y, r, n, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const a = rot + i / n * TAU; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath();
}
function diamond(x, y, w, h) {
  ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h * 0.7); ctx.lineTo(x - w, y); ctx.closePath();
}
function glow(x, y, r, rgb, a) {
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gr; circle(x, y, r); ctx.fill();
}
function shadow(x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

let hoverKey = null;   // ability whose range is previewed
let hoverUnit = null;

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b110d';
  ctx.fillRect(0, 0, view.width, view.height);
  const s = scale * dpr;
  const sx = shakeAmt ? rand(-shakeAmt, shakeAmt) : 0, sy = shakeAmt ? rand(-shakeAmt, shakeAmt) : 0;
  ctx.setTransform(s, 0, 0, s, dpr * cw / 2 - (cam.x + sx) * s, dpr * ch / 2 - (cam.y + sy) * s);
  ctx.drawImage(terrain, 0, 0);
  const uiK = Math.max(1, 0.8 / scale);
  const p = G.player;

  // Fountain shimmer.
  for (const team of [BLUE, RED]) {
    const f = FOUNTAINS[team];
    ctx.strokeStyle = `rgba(${TEAM[team].rgb},${0.25 + 0.15 * Math.sin(G.t * 2.5)})`;
    ctx.lineWidth = 4; circle(f.x, f.y, f.r); ctx.stroke();
  }

  // Ground layer: tower ranges, Starfall markers, hover and click rings.
  if (!p.dead && !G.demo) {
    for (const t of G.units) {
      if (t.type !== 'tower' || t.dead || t.team === p.team) continue;
      const R = t.range + t.r;
      if (dist(p, t) > R + 260) continue;
      const aggro = t.target === p;
      ctx.strokeStyle = aggro ? 'rgba(255,90,78,0.9)' : 'rgba(255,90,78,0.4)';
      ctx.lineWidth = aggro ? 4 : 2.5;
      ctx.setLineDash(aggro ? [] : [14, 10]);
      circle(t.x, t.y, R); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (hoverKey && ABILITIES[hoverKey].range) {
      ctx.strokeStyle = 'rgba(242,193,78,0.5)'; ctx.lineWidth = 2;
      circle(p.x, p.y, ABILITIES[hoverKey].range); ctx.stroke();
    }
  }
  for (const e of G.effects) {
    if (e.kind !== 'star') continue;
    const q = Math.min(1, e.t / e.delay);
    ctx.fillStyle = `rgba(${TEAM[e.team].rgb},${e.fired ? 0.12 * (1 - (e.t - e.delay) / (e.life - e.delay)) : 0.12})`;
    circle(e.x, e.y, e.r); ctx.fill();
    if (!e.fired) {
      ctx.strokeStyle = `rgba(${TEAM[e.team].rgb},0.8)`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, -Math.PI / 2, -Math.PI / 2 + q * TAU); ctx.stroke();
    }
  }
  if (hoverUnit && !hoverUnit.dead) {
    ctx.strokeStyle = 'rgba(255,110,90,0.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(hoverUnit.x, hoverUnit.y + hoverUnit.r * 0.6, hoverUnit.r * 1.3, hoverUnit.r * 0.6, 0, 0, TAU); ctx.stroke();
  }
  if (!p.dead && p.attackTarget && !G.demo) {
    const t = p.attackTarget;
    ctx.strokeStyle = 'rgba(255,90,78,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(t.x, t.y + t.r * 0.6, t.r * 1.35, t.r * 0.65, 0, 0, TAU); ctx.stroke();
  }
  for (const e of G.effects) {
    if (e.kind !== 'click') continue;
    const q = e.t / e.life;
    ctx.strokeStyle = `rgba(123,227,138,${1 - q})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(e.x, e.y, 18 * (1 - q * 0.6), 9 * (1 - q * 0.6), 0, 0, TAU); ctx.stroke();
  }

  // Units, back to front.
  const list = G.units.filter(u => !u.dead || u.kind === 'structure').sort((a, b) => a.y - b.y);
  for (const u of list) {
    if (u.type === 'tower') drawTower(u);
    else if (u.type === 'nexus') drawNexus(u);
    else if (u.kind === 'minion') drawMinion(u);
    else drawHero(u);
  }

  // Projectiles.
  for (const pr of G.projectiles) {
    const tm = TEAM[pr.team];
    if (pr.kind === 'bolt') {
      const a = Math.atan2(pr.vy, pr.vx);
      const tx = pr.x - Math.cos(a) * 70, ty = pr.y - Math.sin(a) * 70;
      const gr = ctx.createLinearGradient(tx, ty, pr.x, pr.y);
      gr.addColorStop(0, `rgba(${tm.rgb},0)`); gr.addColorStop(1, `rgba(${tm.rgb},0.9)`);
      ctx.strokeStyle = gr; ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(pr.x, pr.y); ctx.stroke();
      glow(pr.x, pr.y, 30, tm.rgb, 0.6);
      ctx.fillStyle = tm.light; circle(pr.x, pr.y, 7); ctx.fill();
    } else {
      const big = pr.style === 'tower' || (pr.src.siege > 1), hero = pr.style === 'hero';
      const r = big ? 9 : hero ? 6 : 4;
      if (big || hero) glow(pr.x, pr.y, r * 3, tm.rgb, 0.55);
      ctx.fillStyle = big || hero ? tm.light : tm.color;
      circle(pr.x, pr.y, r); ctx.fill();
    }
  }

  // Air effects.
  for (const e of G.effects) {
    const q = e.t / e.life;
    if (e.kind === 'p') {
      ctx.globalAlpha = 1 - q; ctx.fillStyle = e.color;
      ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
      ctx.globalAlpha = 1;
    } else if (e.kind === 'ring') {
      ctx.strokeStyle = e.color; ctx.globalAlpha = 1 - q; ctx.lineWidth = 4;
      circle(e.x, e.y, e.r0 + (e.r1 - e.r0) * q); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.kind === 'blink') {
      ctx.strokeStyle = e.color; ctx.globalAlpha = (1 - q) * 0.8; ctx.lineWidth = 10 * (1 - q); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.kind === 'star' && !e.fired) {
      const k = e.t / e.delay;
      const y = e.y - (1 - k) * 520;
      ctx.strokeStyle = 'rgba(255,220,130,0.5)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(e.x + (1 - k) * 160, y - 90); ctx.lineTo(e.x, y); ctx.stroke();
      glow(e.x, y, 46, '255,210,110', 0.85);
      ctx.fillStyle = '#fff6d8'; circle(e.x, y, 10); ctx.fill();
    }
  }

  // Bars and labels.
  for (const u of list) drawBars(u, uiK);

  // Floating text.
  ctx.textAlign = 'center';
  for (const t of G.texts) {
    const q = t.t / t.life;
    ctx.globalAlpha = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3;
    ctx.font = `600 ${t.size * uiK}px Teko, 'Arial Narrow', sans-serif`;
    ctx.lineWidth = 3 * uiK; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawGuard(u) {
  if (!u.guardedBy || u.guardedBy.dead) return;
  ctx.strokeStyle = `rgba(${TEAM[u.team].rgb},0.4)`; ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]); circle(u.x, u.y, u.r + 12); ctx.stroke(); ctx.setLineDash([]);
}

function drawRubble(u, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(u.x, u.y + 6, r * 1.2, r * 0.6, 0, 0, TAU); ctx.fill();
  const rnd = mulberry32(u.id * 97);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, d = rnd() * r;
    ctx.fillStyle = i % 2 ? '#4e5359' : '#3b3f44';
    poly(u.x + Math.cos(a) * d, u.y + Math.sin(a) * d * 0.6, 6 + rnd() * 9, 5, rnd() * TAU); ctx.fill();
  }
}

function drawTower(t) {
  const tm = TEAM[t.team];
  if (t.dead) { drawRubble(t, 34); return; }
  shadow(t.x + 6, t.y + 12, t.r + 10, t.r * 0.55);
  drawGuard(t);
  ctx.fillStyle = '#41464c'; poly(t.x, t.y + 4, t.r, 8, Math.PI / 8); ctx.fill();
  ctx.fillStyle = '#626970'; poly(t.x, t.y - 3, t.r * 0.8, 8, Math.PI / 8); ctx.fill();
  const g = ctx.createLinearGradient(t.x - 13, 0, t.x + 13, 0);
  g.addColorStop(0, '#596067'); g.addColorStop(0.5, '#9aa2a9'); g.addColorStop(1, '#596067');
  ctx.fillStyle = g; ctx.fillRect(t.x - 13, t.y - 60, 26, 56);
  ctx.fillStyle = '#7f878e'; ctx.fillRect(t.x - 18, t.y - 64, 36, 8);
  const pulse = 0.6 + 0.4 * Math.sin(G.t * 3 + t.id);
  glow(t.x, t.y - 82, 34, tm.rgb, 0.3 * pulse + (t.target ? 0.3 : 0));
  ctx.fillStyle = tm.deep; diamond(t.x, t.y - 82, 13, 22); ctx.fill();
  ctx.fillStyle = tm.color; diamond(t.x, t.y - 83, 9, 17); ctx.fill();
  ctx.fillStyle = tm.light; diamond(t.x - 3, t.y - 88, 3, 7); ctx.fill();
  if (t.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; poly(t.x, t.y - 3, t.r * 0.8, 8, Math.PI / 8); ctx.fill(); }
}

function drawNexus(n) {
  const tm = TEAM[n.team];
  if (n.dead) { drawRubble(n, 56); return; }
  shadow(n.x + 6, n.y + 14, n.r + 14, n.r * 0.6);
  drawGuard(n);
  ctx.fillStyle = '#353a40'; poly(n.x, n.y + 6, n.r + 4, 6, Math.PI / 6); ctx.fill();
  ctx.fillStyle = '#565d64'; poly(n.x, n.y, n.r - 6, 6, Math.PI / 6); ctx.fill();
  ctx.strokeStyle = `rgba(${tm.rgb},0.6)`; ctx.lineWidth = 3; poly(n.x, n.y, n.r - 18, 6, Math.PI / 6); ctx.stroke();
  const bob = Math.sin(G.t * 2 + n.team) * 4;
  glow(n.x, n.y - 46 + bob, 80, tm.rgb, 0.35 + 0.1 * Math.sin(G.t * 3));
  ctx.fillStyle = tm.deep; diamond(n.x, n.y - 44 + bob, 24, 46); ctx.fill();
  ctx.fillStyle = tm.color; diamond(n.x, n.y - 46 + bob, 17, 37); ctx.fill();
  ctx.fillStyle = tm.light; diamond(n.x - 5, n.y - 56 + bob, 5, 13); ctx.fill();
  if (n.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.2)'; diamond(n.x, n.y - 46 + bob, 17, 37); ctx.fill(); }
}

function drawMinion(m) {
  const tm = TEAM[m.team];
  shadow(m.x, m.y + m.r * 0.7, m.r, m.r * 0.42);
  ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.facing);
  if (m.type === 'siege') {
    ctx.fillStyle = '#3a3f45'; rrect(-m.r, -m.r * 0.8, m.r * 2, m.r * 1.6, 4); ctx.fill();
    ctx.fillStyle = '#8a9198'; ctx.fillRect(m.r - 6, -4, 14 - m.swing * 30, 8);
    ctx.fillStyle = tm.color; circle(-2, 0, m.r * 0.55); ctx.fill();
    ctx.fillStyle = tm.light; circle(-2, 0, m.r * 0.22); ctx.fill();
  } else if (m.type === 'melee') {
    ctx.fillStyle = '#d6dbe0';
    ctx.fillRect(m.r - 3 + m.swing * 40, -2, 10, 4);
    ctx.fillStyle = tm.deep; rrect(-m.r, -m.r, m.r * 2, m.r * 2, 4); ctx.fill();
    ctx.fillStyle = tm.color; rrect(-m.r + 3, -m.r + 3, m.r * 2 - 6, m.r * 2 - 6, 3); ctx.fill();
  } else {
    ctx.fillStyle = tm.deep; circle(0, 0, m.r); ctx.fill();
    ctx.fillStyle = tm.color; circle(0, 0, m.r - 3); ctx.fill();
    ctx.fillStyle = tm.light; circle(m.r + 1, 0, 3); ctx.fill();
  }
  if (m.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; circle(0, 0, m.r * 0.9); ctx.fill(); }
  ctx.restore();
}

function drawHero(h) {
  if (h.dead) return;
  const tm = TEAM[h.team];
  shadow(h.x, h.y + h.r * 0.7, h.r * 1.05, h.r * 0.45);
  if (h.isPlayer && !G.demo) {
    ctx.strokeStyle = 'rgba(123,227,138,0.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(h.x, h.y + h.r * 0.7, h.r * 1.3, h.r * 0.58, 0, 0, TAU); ctx.stroke();
  }
  ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.facing);
  const reach = h.r + 10 + h.swing * 30;
  ctx.strokeStyle = '#cdb88a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6, h.r * 0.6); ctx.lineTo(reach, h.r * 0.6); ctx.stroke();
  glow(reach, h.r * 0.6, 14, tm.rgb, 0.7);
  ctx.fillStyle = tm.light; circle(reach, h.r * 0.6, 4); ctx.fill();
  ctx.fillStyle = tm.deep; circle(0, 0, h.r); ctx.fill();
  ctx.fillStyle = tm.color; circle(0, 0, h.r * 0.74); ctx.fill();
  ctx.fillStyle = tm.light;
  ctx.beginPath(); ctx.moveTo(h.r * 0.95, 0); ctx.lineTo(h.r * 0.15, -h.r * 0.5); ctx.lineTo(h.r * 0.15, h.r * 0.5); ctx.closePath(); ctx.fill();
  if (h.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; circle(0, 0, h.r); ctx.fill(); }
  ctx.restore();
}

function drawBars(u, k) {
  if (u.dead) return;
  let w, bh, y;
  if (u.kind === 'minion') { w = u.type === 'siege' ? 38 : 26; bh = 4; y = u.y - u.r - 9 * k; }
  else if (u.kind === 'hero') { w = 64; bh = 8; y = u.y - u.r - 22 * k; }
  else { w = u.type === 'nexus' ? 110 : 84; bh = 8; y = u.y - (u.type === 'nexus' ? 104 : 112) - 6 * k; }
  w *= k; bh *= k;
  const x = u.x - w / 2;
  const color = u.isPlayer && !G.demo ? '#68d86a' : u.team === BLUE ? '#4fa3ff' : '#ff5a4e';
  ctx.fillStyle = 'rgba(5,8,6,0.85)';
  ctx.fillRect(x - 1.5, y - 1.5, w + 3, bh + 3 + (u.kind === 'hero' ? 4 * k : 0));
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, u.hp / u.maxHp), bh);
  if (u.kind === 'hero') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 200; i < u.maxHp; i += 200) ctx.fillRect(x + w * i / u.maxHp, y, 1, bh * 0.6);
    ctx.fillStyle = '#7d95ff';
    ctx.fillRect(x, y + bh + 1, w * (u.mana / u.maxMana), 3 * k);
    // Level badge and name.
    ctx.fillStyle = 'rgba(5,8,6,0.9)'; circle(x - 9 * k, y + bh / 2 + 1, 9 * k); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `600 ${13 * k}px Teko, 'Arial Narrow', sans-serif`;
    ctx.fillText(u.level, x - 9 * k, y + bh / 2 + 5 * k);
    ctx.font = `600 ${11 * k}px Barlow, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(u.name, u.x, y - 5 * k);
  }
}

function drawMinimap() {
  const mw = mini.width, mh = mini.height;
  if (!mw || !mh) return;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.drawImage(miniTerrain, 0, 0, mw, mh);
  mctx.fillStyle = 'rgba(5,8,6,0.25)'; mctx.fillRect(0, 0, mw, mh);
  const sx = mw / W, sy = mh / H;
  mctx.setTransform(sx, 0, 0, sy, 0, 0);
  for (const u of G.units) {
    if (u.dead) continue;
    const tm = TEAM[u.team];
    if (u.kind === 'structure') {
      const s = u.type === 'nexus' ? 120 : 80;
      mctx.fillStyle = '#0b110d'; mctx.fillRect(u.x - s / 2 - 12, u.y - s / 2 - 12, s + 24, s + 24);
      mctx.fillStyle = tm.color; mctx.fillRect(u.x - s / 2, u.y - s / 2, s, s);
    } else if (u.kind === 'minion') {
      mctx.fillStyle = tm.color; mctx.fillRect(u.x - 18, u.y - 18, 36, 36);
    }
  }
  for (const h of G.heroes) {
    if (h.dead) continue;
    mctx.fillStyle = TEAM[h.team].color;
    mctx.beginPath(); mctx.arc(h.x, h.y, 70, 0, TAU); mctx.fill();
    mctx.lineWidth = 16; mctx.strokeStyle = h.isPlayer && !G.demo ? '#7be38a' : '#0b110d'; mctx.stroke();
  }
  const vw = cw / scale, vh = ch / scale;
  mctx.strokeStyle = 'rgba(255,255,255,0.75)'; mctx.lineWidth = 14;
  mctx.strokeRect(cam.x - vw / 2, cam.y - vh / 2, vw, vh);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), top: $('top'), kBlue: $('kBlue'), kRed: $('kRed'), clock: $('clock'), wave: $('wave'), kda: $('kda'),
  lvl: $('lvl'), portrait: $('portrait'), hpFill: $('hpFill'), hpText: $('hpText'), mpFill: $('mpFill'), mpText: $('mpText'),
  gold: $('gold'), items: $('items'), shop: $('shop'), shopList: $('shopList'), shopNote: $('shopNote'),
  banner: $('banner'), respawn: $('respawn'), title: $('title'), pause: $('pause'), end: $('end'),
  endTitle: $('endTitle'), endText: $('endText'), endStats: $('endStats'), abilities: $('abilities'),
};
const cache = new Map();
function set(el, v) { if (cache.get(el) !== v) { cache.set(el, v); el.textContent = v; } }
function setStyle(el, prop, v) {
  const key = el.id + prop;
  if (cache.get(key) !== v) { cache.set(key, v); el.style.setProperty(prop, v); }
}

const ICONS = {
  Q: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#c9b4ff" d="M13.5 2 4 14h6.5L9.5 22 20 9.5h-6.5z"/></svg>',
  W: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="#9edcff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h11"/><path d="M10 6l6 6-6 6"/><path d="M20 4v16"/></g></svg>',
  E: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#7be38a" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>',
  R: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffd36b" d="m12 2 2.9 6.6 7.1.7-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.3l7.1-.7z"/></svg>',
};
const abButtons = {};
for (const k of KEYS) {
  const a = ABILITIES[k];
  const b = document.createElement('button');
  b.className = 'ab'; b.id = 'ab' + k; b.type = 'button';
  b.setAttribute('aria-label', `${a.name} (${k})`);
  b.title = `${a.name} [${k}]: ${a.desc} ${a.mana} mana, ${a.cd}s cooldown.`;
  b.innerHTML = `${ICONS[k]}<span class="ab-key">${k}</span><span class="ab-cost">${a.mana}</span><i class="ab-cd"></i><b class="ab-time"></b>`;
  b.addEventListener('click', () => playerCast(k, true));
  b.addEventListener('mouseenter', () => { hoverKey = k; });
  b.addEventListener('mouseleave', () => { hoverKey = null; });
  ui.abilities.appendChild(b);
  abButtons[k] = { el: b, time: b.querySelector('.ab-time') };
}
const slots = [];
for (let i = 0; i < MAX_ITEMS; i++) {
  const s = document.createElement('div');
  s.className = 'slot'; s.id = 'slot' + i;
  ui.items.appendChild(s); slots.push(s);
}

function updateHud() {
  const p = G.player;
  set(ui.kBlue, String(G.kills[BLUE]));
  set(ui.kRed, String(G.kills[RED]));
  set(ui.clock, fmtTime(G.t));
  set(ui.wave, `Wave ${G.wave + 1} in ${Math.max(0, Math.ceil(G.nextWave - G.t))}s`);
  set(ui.kda, `${p.kills} / ${p.deaths} · ${p.cs} CS`);
  set(ui.lvl, String(p.level));
  setStyle(ui.portrait, '--xp', p.level >= MAX_LEVEL ? '1' : (p.xp / xpToNext(p.level)).toFixed(3));
  setStyle(ui.hpFill, '--w', (100 * Math.max(0, p.hp) / p.maxHp).toFixed(1) + '%');
  set(ui.hpText, `${Math.ceil(Math.max(0, p.hp))} / ${Math.round(p.maxHp)}`);
  setStyle(ui.mpFill, '--w', (100 * p.mana / p.maxMana).toFixed(1) + '%');
  set(ui.mpText, `${Math.floor(p.mana)} / ${Math.round(p.maxMana)}`);
  set(ui.gold, String(Math.floor(p.gold)));
  for (const k of KEYS) {
    const a = ABILITIES[k], { el, time } = abButtons[k];
    const cd = p.cds[k], total = a.cd * (1 - p.haste);
    el.classList.toggle('locked', k === 'R' && p.level < a.unlock);
    el.classList.toggle('nomana', p.mana < a.mana);
    setStyle(el, '--p', cd > 0 ? (cd / total).toFixed(3) : '0');
    set(time, cd > 0 ? (cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd))) : '');
  }
  slots.forEach((s, i) => {
    const id = p.items[i];
    set(s, id ? ITEM[id].tag : '');
    s.classList.toggle('filled', !!id);
    s.title = id ? `${ITEM[id].name}: ${ITEM[id].text}` : 'Empty slot';
  });
  ui.respawn.hidden = !p.dead || state === 'over';
  if (p.dead) set(ui.respawn, `Respawning in ${Math.ceil(p.respawn)}`);
}

let bannerTimer = 0;
function announce(text, tone) {
  ui.banner.textContent = text;
  ui.banner.className = 'banner tone-' + tone;
  ui.banner.hidden = false;
  void ui.banner.offsetWidth;
  ui.banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { ui.banner.hidden = true; }, 2600);
}

let shopSig = '';
function renderShop(force) {
  const p = G.player;
  const ok = canShop(p);
  const sig = [ok, p.items.join(), ITEMS.map(it => p.gold >= it.cost).join()].join('|');
  if (!force && sig === shopSig) { ui.shopNote.textContent = ok ? `You have ${Math.floor(p.gold)} gold.` : 'Return to your fountain to buy items.'; return; }
  shopSig = sig;
  ui.shopNote.textContent = ok ? `You have ${Math.floor(p.gold)} gold.` : 'Return to your fountain to buy items.';
  ui.shopList.innerHTML = '';
  for (const it of ITEMS) {
    const owned = p.items.filter(i => i === it.id).length;
    let reason = '';
    if (it.unique && owned) reason = 'Owned';
    else if (p.items.length >= MAX_ITEMS) reason = 'Bag full';
    else if (!ok) reason = 'At base only';
    const poor = !reason && p.gold < it.cost;
    const row = document.createElement('div');
    row.className = 'shop-row';
    row.innerHTML = `<span class="slot filled">${it.tag}</span><div class="shop-info"><strong>${it.name}${owned ? ` <em>×${owned}</em>` : ''}</strong><span>${it.text}</span></div>`;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn buy'; btn.id = 'buy-' + it.id;
    btn.innerHTML = reason ? reason : `Buy <span>${it.cost}</span>`;
    btn.disabled = !!reason || poor;
    btn.addEventListener('click', () => { if (buy(p, it.id)) renderShop(true); });
    row.appendChild(btn);
    ui.shopList.appendChild(row);
  }
}
let shopRefresh = 0;
function toggleShop(force) {
  const open = force ?? ui.shop.hidden;
  ui.shop.hidden = !open;
  if (open) renderShop(true);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
let state = 'title'; // title | playing | paused | over
const mouse = { sx: 0, sy: 0, inside: false };
let pointerType = 'mouse';
let steering = false;

function pickEnemyAt(wx, wy) {
  let best = null, bd = Infinity;
  const tol = 10 / scale;
  for (const u of G.units) {
    if (u.dead || u.team === G.player.team) continue;
    const ry = u.kind === 'structure' ? (u.type === 'nexus' ? 50 : 50) : 0;
    const d = Math.hypot(u.x - wx, u.y - ry - wy) - (u.kind === 'structure' ? u.r + 30 : u.r) - tol;
    const score = d - (u.kind === 'hero' ? 20 : 0);
    if (d <= 0 && score < bd) { bd = score; best = u; }
  }
  return best;
}

function orderAt(sx, sy, click) {
  const p = G.player;
  if (p.dead) return;
  const w = screenToWorld(sx, sy);
  const enemy = pickEnemyAt(w.x, w.y);
  if (enemy && click) {
    if (!isTargetable(enemy)) {
      addText(enemy.x, enemy.y - 120, 'Protected. Destroy the tower in front first.', '#ffd6cf', 18);
      return;
    }
    p.attackTarget = enemy; p.moveTo = null;
    steering = false;
    return;
  }
  p.attackTarget = null;
  p.moveTo = { x: clampX(w.x), y: clampY(w.y) };
  if (click) G.effects.push({ kind: 'click', x: p.moveTo.x, y: p.moveTo.y, t: 0, life: 0.4 });
}

view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('pointerdown', e => {
  pointerType = e.pointerType;
  mouse.sx = e.offsetX; mouse.sy = e.offsetY; mouse.inside = true;
  if (state !== 'playing') return;
  if (e.button !== 0 && e.button !== 2) return;
  steering = true;
  view.setPointerCapture(e.pointerId);
  orderAt(e.offsetX, e.offsetY, true);
});
view.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') pointerType = 'mouse';
  mouse.sx = e.offsetX; mouse.sy = e.offsetY; mouse.inside = true;
  if (steering && state === 'playing') orderAt(e.offsetX, e.offsetY, false);
});
const endSteer = () => { steering = false; };
view.addEventListener('pointerup', endSteer);
view.addEventListener('pointercancel', endSteer);
view.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') mouse.inside = false; });

mini.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (state !== 'playing' || G.player.dead) return;
  const r = mini.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
  G.player.attackTarget = null;
  G.player.moveTo = { x: clampX(x), y: clampY(y) };
});

function autoAim(p, key) {
  const a = ABILITIES[key];
  if (key === 'E') return { x: p.x, y: p.y };
  if (key === 'W') {
    const dest = p.moveTo || p.attackTarget;
    if (dest) return { x: dest.x, y: dest.y };
    return { x: p.x + Math.cos(p.facing) * a.range, y: p.y + Math.sin(p.facing) * a.range };
  }
  let best = null, bd = Infinity;
  for (const u of G.units) {
    if (u.team === p.team || !isTargetable(u) || u.kind === 'structure') continue;
    const d = dist(p, u);
    if (d > a.range) continue;
    const score = d - (u.kind === 'hero' ? 500 : 0);
    if (score < bd) { bd = score; best = u; }
  }
  if (best) {
    const tt = key === 'Q' ? dist(p, best) / 1150 : 0.4;
    return { x: best.x + best.vx * tt, y: best.y + best.vy * tt };
  }
  return { x: p.x + Math.cos(p.facing) * 300, y: p.y + Math.sin(p.facing) * 300 };
}

function playerCast(key, fromButton) {
  if (state !== 'playing') return;
  const p = G.player;
  if (p.dead) return;
  let aim;
  if (!fromButton && pointerType === 'mouse' && mouse.inside) aim = screenToWorld(mouse.sx, mouse.sy);
  else aim = autoAim(p, key);
  const why = castAbility(p, key, aim.x, aim.y);
  if (why) {
    const el = abButtons[key].el;
    el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny');
    if (why === 'locked') addText(p.x, p.y - 60, `Starfall unlocks at level ${ABILITIES.R.unlock}`, '#d8d8d8', 18);
    else if (why === 'mana') addText(p.x, p.y - 60, 'Not enough mana', '#9fb0ff', 18);
  }
}

window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'p') {
    if (state === 'playing' && !ui.shop.hidden && k === 'escape') { toggleShop(false); return; }
    if (state === 'playing') setPaused(true);
    else if (state === 'paused') setPaused(false);
    return;
  }
  if (state !== 'playing' || e.repeat) return;
  if (k === 'q' || k === 'w' || k === 'e' || k === 'r') { playerCast(k.toUpperCase(), false); e.preventDefault(); }
  else if (k === 's') { G.player.moveTo = null; G.player.attackTarget = null; }
  else if (k === 'b') toggleShop();
});

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
function startGame() {
  newGame(false);
  state = 'playing';
  ui.title.hidden = true; ui.end.hidden = true; ui.pause.hidden = true;
  ui.hud.hidden = false; ui.top.hidden = false; mini.hidden = false;
  toggleShop(false);
  resize();
  announce('Destroy the enemy Nexus', 'gold');
}
function setPaused(on) {
  state = on ? 'paused' : 'playing';
  ui.pause.hidden = !on;
}
function showEnd() {
  const p = G.player;
  const won = G.winner === p.team;
  ui.endTitle.textContent = won ? 'Victory' : 'Defeat';
  ui.endTitle.className = won ? 'win' : 'loss';
  ui.endText.textContent = won ? 'The red Nexus has fallen.' : 'Vex destroyed your Nexus.';
  ui.endStats.innerHTML = [
    ['Time', fmtTime(G.t)], ['Kills', p.kills], ['Deaths', p.deaths],
    ['Minions', p.cs], ['Level', p.level], ['Items', p.items.length],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  ui.end.hidden = false;
  toggleShop(false);
}

$('playBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('quitBtn').addEventListener('click', () => {
  state = 'title'; newGame(true);
  ui.pause.hidden = true; ui.title.hidden = false; ui.hud.hidden = true; ui.top.hidden = true; mini.hidden = true;
  toggleShop(false);
});
$('pauseBtn').addEventListener('click', () => setPaused(true));
$('shopBtn').addEventListener('click', () => toggleShop());
$('shopClose').addEventListener('click', () => toggleShop(false));
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') setPaused(true); });
window.addEventListener('resize', resize);
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state !== 'paused') {
    if (!G.over) update(dt);
    else {
      G.overT += dt;
      updateEffects(dt); updateTexts(dt);
      if (G.demo && G.overT > 4) newGame(true);
      else if (state === 'playing' && G.overT > 1.6) { state = 'over'; showEnd(); }
    }
    if (!ui.shop.hidden && (shopRefresh += dt) > 0.3) { shopRefresh = 0; renderShop(); }
  }
  updateCamera(dt);
  if (state === 'playing' && pointerType === 'mouse' && mouse.inside) {
    const w = screenToWorld(mouse.sx, mouse.sy);
    const u = pickEnemyAt(w.x, w.y);
    hoverUnit = u && isTargetable(u) ? u : null;
    view.style.cursor = hoverUnit ? 'crosshair' : 'default';
  } else hoverUnit = null;
  draw();
  if (state !== 'title') { drawMinimap(); updateHud(); }
  requestAnimationFrame(frame);
}

newGame(true);
ui.hud.hidden = true; ui.top.hidden = true; mini.hidden = true;
resize();
requestAnimationFrame(frame);

// Debug hook for tests and tinkering in the console.
window.lanefall = { get game() { return G; }, step: (sec = 1) => { for (let i = 0; i < sec * 60; i++) { if (G.over) break; update(1 / 60); } } };
})();
