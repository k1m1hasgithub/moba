// Lanefall: bot brains. Each bot plays its role, fights when the odds look good,
// retreats and recalls when hurt.
'use strict';
(function (LF) {
const D = LF.data;
const { BLUE } = D;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ROLE_LANE = ['top', null, 'mid', 'bot', null];

function think(h, G) {
  const sim = LF.sim;
  const diff = D.DIFFICULTY[h.diff] || D.DIFFICULTY.normal;
  const ai = h.ai;
  const hp = h.hp / h.maxHp;
  const home = D.FOUNTAIN[h.team];
  const enemies = G.heroes.filter(e => !e.dead && e.team !== h.team);
  const allies = G.heroes.filter(a => !a.dead && a.team === h.team && a !== h);
  const atHome = dist(h, home) < home.r - 40;

  if (h.recall) {
    if (enemies.some(e => dist(e, h) < 650)) h.recall = null;
    else return;
  }
  if (ai.state === 'heal') {
    if (atHome && hp > 0.93 && h.mana > h.maxMana * 0.7) ai.state = null;
    else if (atHome) { h.moveTo = null; h.attackTarget = null; return; }
    else { retreat(h, G, enemies, diff); return; }
  }
  if (hp < 0.27 || (hp < 0.42 && h.mana < 70)) { ai.state = 'heal'; retreat(h, G, enemies, diff); return; }

  useHeals(h, G, diff);

  // ----- Fights -----
  const foes = enemies.filter(e => dist(e, h) < 950);
  if (foes.length) {
    let target = null, best = Infinity;
    for (const e of foes) {
      const tw = enemyTowerCovering(e, G, h.team);
      const ePct = e.hp / e.maxHp;
      if (tw && !(ePct < 0.22 && hp > 0.55)) continue; // don't dive unless it's a kill
      const score = dist(h, e) + ePct * 500;
      if (score < best) { best = score; target = e; }
    }
    const mine = power([h].concat(allies.filter(a => dist(a, h) < 850)));
    const theirs = power(enemies.filter(e => target ? dist(e, target) < 850 : dist(e, h) < 850));
    if (target) {
      const tPct = target.hp / target.maxHp;
      const engage = mine >= theirs * diff.brave || (tPct < 0.25 && hp > 0.4);
      if (engage) {
        ai.mode = 'fight';
        h.attackTarget = target; h.moveTo = null;
        useSkills(h, G, 'fight', target, diff);
        return;
      }
    }
    const closest = foes.reduce((a, b) => (dist(a, h) < dist(b, h) ? a : b));
    if (dist(closest, h) < 600 && mine < theirs * 0.85) {
      ai.mode = 'flee';
      useSkills(h, G, 'flee', closest, diff);
      const a = Math.atan2(h.y - closest.y, h.x - closest.x);
      const toHome = Math.atan2(home.y - h.y, home.x - h.x);
      const dir = Math.atan2(Math.sin(a) + Math.sin(toHome) * 1.5, Math.cos(a) + Math.cos(toHome) * 1.5);
      goTo(h, h.x + Math.cos(dir) * 260, h.y + Math.sin(dir) * 260);
      return;
    }
    if (hp > 0.55) useSkills(h, G, 'poke', closest, diff);
  }
  ai.mode = 'farm';

  // ----- Defend a structure under siege -----
  for (const s of G.structs) {
    if (s.dead || s.team !== h.team) continue;
    if (s.hp / s.maxHp > 0.95) continue;
    const raiders = enemies.filter(e => dist(e, s) < s.range + 200);
    if (raiders.length && dist(h, s) < 2000 && raiders.length <= allies.filter(a => dist(a, s) < 1500).length + 1) {
      goTo(h, s.x + (h.team === BLUE ? 60 : -60), s.y + (h.team === BLUE ? 60 : -60));
      return;
    }
  }

  // ----- Role duty -----
  const role = h.role;
  if (role === 1) { if (jungle(h, G, enemies, diff)) return; }
  else if (role === 4) { if (roam(h, G, allies, diff)) return; }
  if (role === 4 || role === 1) {
    if (bossCheck(h, G, enemies, diff)) return;
  }
  lane(h, G, ROLE_LANE[role] || 'mid', diff);
}

function power(list) {
  let p = 0;
  for (const u of list) p += (u.hp / u.maxHp) * (0.6 + u.level * 0.1);
  return p;
}

function goTo(h, x, y) {
  h.attackTarget = null;
  h.moveTo = { x: Math.max(60, Math.min(D.W - 60, x)), y: Math.max(60, Math.min(D.H - 60, y)) };
}

function enemyTowerCovering(p, G, myTeam) {
  for (const s of G.structs) {
    if (s.dead || s.team === myTeam) continue;
    if (dist(p, s) < s.range + s.r + 20) return s;
  }
  return null;
}
function towerBusy(s) { return s.target && !s.target.dead && s.target.kind === 'minion'; }
function safeFor(h, G, p, pad) {
  for (const s of G.structs) {
    if (s.dead || s.team === h.team) continue;
    if (dist(p, s) < s.range + s.r + (pad || 40) && !towerBusy(s)) return false;
  }
  return true;
}

function retreat(h, G, enemies, diff) {
  const home = D.FOUNTAIN[h.team];
  const threat = enemies.find(e => dist(e, h) < 900);
  if (!threat && G.t - h.lastCombat > 2.5 && dist(h, home) > home.r + 300) {
    h.moveTo = null; h.attackTarget = null;
    LF.sim.startRecall(h);
    return;
  }
  if (threat && dist(threat, h) < 520) useSkills(h, G, 'flee', threat, diff);
  goTo(h, home.x, home.y);
}

function aimAt(h, sk, t, diff) {
  const d = dist(h, t);
  let lead = 0;
  if (sk.type === 'line') lead = d / sk.speed;
  else if (sk.type === 'circle') lead = sk.delay * 0.8;
  else if (sk.type === 'zone' || sk.type === 'leap') lead = 0.3;
  const err = diff.aimErr;
  return {
    x: t.x + (t.vx || 0) * lead + (Math.random() - 0.5) * err,
    y: t.y + (t.vy || 0) * lead + (Math.random() - 0.5) * err,
  };
}

function ready(h, key) {
  const sk = h.def.skill[key];
  return h.cds[key] <= 0 && h.mana >= sk.mana && (key !== 'ult' || h.level >= D.ULT_LEVEL);
}

function useSkills(h, G, mode, target, diff) {
  const sim = LF.sim;
  for (const key of ['ult', 's1', 's2']) {
    if (!ready(h, key)) continue;
    if (Math.random() > diff.react) continue;
    const sk = h.def.skill[key];
    const d = target ? dist(h, target) : Infinity;
    const tPct = target ? target.hp / target.maxHp : 1;
    const isHero = target && target.kind === 'hero';
    let cast = null;
    switch (sk.ai) {
      case 'harass':
        if (target && (mode !== 'flee')) {
          const reach = sk.type === 'cone' ? sk.range + target.r : (sk.range || 0) * 0.92;
          if (d < reach && (isHero || mode === 'farm')) cast = aimAt(h, sk, target, diff);
        }
        break;
      case 'engage':
        if (target && (mode === 'fight' || (mode === 'farm' && sk.jungle)) && d < (sk.range || sk.radius || 300) * 0.92) cast = aimAt(h, sk, target, diff);
        else if (mode === 'flee' && (sk.type === 'dash' || sk.type === 'leap')) cast = awayPoint(h, target);
        break;
      case 'escape':
        if (mode === 'flee') cast = awayPoint(h, target);
        else if (mode === 'fight' && target && !h.def.attack.melee && d < 220) cast = awayPoint(h, target);
        break;
      case 'buff':
        if (target && (mode === 'fight' || (mode === 'farm' && target.kind === 'monster')) && d < h.range + 260) cast = { x: h.x, y: h.y };
        break;
      case 'aoe': {
        if (!target || mode === 'flee') break;
        const reach = sk.type === 'nova' ? sk.radius : sk.follow ? sk.radius : (sk.range || 0) + sk.radius * 0.5;
        if (d > reach) break;
        if (isHero && (mode === 'fight' || tPct < 0.55 || key !== 'ult')) cast = sk.follow || sk.type === 'nova' ? { x: h.x, y: h.y } : aimAt(h, sk, target, diff);
        else if (mode === 'farm' && key !== 'ult' && h.mana > h.maxMana * 0.4) cast = sk.type === 'nova' ? { x: h.x, y: h.y } : aimAt(h, sk, target, diff);
        break;
      }
      case 'execute':
        if (isHero && d < sk.range && (tPct < 0.45 || (mode === 'fight' && tPct < 0.6))) cast = { x: target.x, y: target.y };
        break;
      default: break;
    }
    if (cast) { sim.cast(h, key, cast.x, cast.y); return; }
  }
}

function awayPoint(h, from) {
  const home = D.FOUNTAIN[h.team];
  let a = Math.atan2(home.y - h.y, home.x - h.x);
  if (from) {
    const b = Math.atan2(h.y - from.y, h.x - from.x);
    a = Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
  }
  return { x: h.x + Math.cos(a) * 500, y: h.y + Math.sin(a) * 500 };
}

function useHeals(h, G, diff) {
  for (const key of ['ult', 's1', 's2']) {
    const sk = h.def.skill[key];
    if (sk.ai !== 'heal' || !ready(h, key)) continue;
    const reach = sk.type === 'nova' ? sk.radius : (sk.range || 0) + sk.radius * 0.6;
    const hurt = G.heroes.filter(a => !a.dead && a.team === h.team && dist(a, h) < reach && a.hp / a.maxHp < (key === 'ult' ? 0.45 : 0.62));
    if (!hurt.length || Math.random() > diff.react) continue;
    const t = hurt.reduce((a, b) => (a.hp / a.maxHp < b.hp / b.maxHp ? a : b));
    LF.sim.cast(h, key, sk.type === 'nova' ? h.x : t.x, sk.type === 'nova' ? h.y : t.y);
    return;
  }
}

// ----- Laning -----
function lane(h, G, laneId, diff) {
  const L = D.LANES[laneId];
  const dir = h.team === BLUE ? 1 : -1;
  let frontS = null;
  for (const u of G.units) {
    if (u.kind !== 'minion' || u.dead || u.team !== h.team || u.lane !== laneId) continue;
    const s = D.laneProject(L, u.x, u.y).s;
    if (frontS === null || s * dir > frontS * dir) frontS = s;
  }
  let ownS = h.team === BLUE ? 0 : L.len;
  for (const s of G.structs) {
    if (s.dead || s.team !== h.team || s.lane !== laneId) continue;
    const p = D.laneProject(L, s.x, s.y).s;
    if (p * dir > ownS * dir) ownS = p;
  }
  if (frontS === null) frontS = ownS + dir * 120;
  let want = frontS - dir * 170;

  // Enemy structure that blocks this lane next (tower, else the core).
  let block = null, blockS = 0;
  for (const s of G.structs) {
    if (s.dead || s.team === h.team) continue;
    if (s.lane !== laneId && s.kind !== 'core') continue;
    const p = s.kind === 'core' ? (h.team === BLUE ? L.len + 200 : -200) : D.laneProject(L, s.x, s.y).s;
    if (!block || p * dir < blockS * dir) { block = s; blockS = p; }
  }
  if (block && !towerBusy(block)) {
    const stop = blockS - dir * (block.range + block.r + 110);
    want = dir > 0 ? Math.min(want, stop) : Math.max(want, stop);
  }

  // Farm minions that are safe to reach.
  let best = null;
  for (const u of G.units) {
    if (u.kind !== 'minion' || u.dead || u.team === h.team) continue;
    if (dist(u, h) > 650 || !safeFor(h, G, u, 30)) continue;
    const lastHit = u.hp < h.ad * 1.15;
    if (!best || (lastHit && !(best.hp < h.ad * 1.15)) || (lastHit === (best.hp < h.ad * 1.15) && u.hp < best.hp)) best = u;
  }
  if (best) {
    h.attackTarget = best; h.moveTo = null;
    if (h.role === 2 || h.role === 0) {
      const cluster = G.units.filter(u => u.kind === 'minion' && !u.dead && u.team !== h.team && dist(u, best) < 220).length;
      if (cluster >= 3 && h.mana > h.maxMana * 0.6) useSkills(h, G, 'farm', best, diff);
    }
    return;
  }
  if (block && LF.sim.isTargetable(block) && (towerBusy(block) || (block.kind === 'core' && !block.target)) && dist(h, block) < 900) {
    h.attackTarget = block; h.moveTo = null;
    return;
  }
  const p = D.laneAt(L, want);
  const side = (h.seat % 2 ? 1 : -1) * 40;
  goTo(h, p.x - p.dy * side, p.y + p.dx * side);
}

// ----- Jungle -----
function jungle(h, G, enemies, diff) {
  const ai = h.ai;
  let camp = ai.camp && !ai.camp.dead && !ai.camp.resetting ? ai.camp : null;
  if (!camp) {
    const mine = G.monsters.filter(m => !m.dead && !m.boss && m.side === h.team && !m.resetting);
    if (mine.length) {
      mine.sort((a, b) => (dist(a, h) - (D.MONSTERS[a.mtype].buff ? 500 : 0)) - (dist(b, h) - (D.MONSTERS[b.mtype].buff ? 500 : 0)));
      camp = mine[0];
    }
    ai.camp = camp;
  }
  // Gank: a nearby enemy laner who is hurt, or any enemy close to us.
  const prey = enemies.filter(e => dist(e, h) < 1600 && e.hp / e.maxHp < 0.65 && !enemyTowerCovering(e, G, h.team));
  if (prey.length && h.level >= 3 && h.hp / h.maxHp > 0.55) {
    const t = prey.reduce((a, b) => (dist(a, h) < dist(b, h) ? a : b));
    goTo(h, t.x, t.y);
    return true;
  }
  if (camp) {
    if (dist(h, camp) > 380) goTo(h, camp.home.x, camp.home.y);
    else { h.attackTarget = camp; h.moveTo = null; useSkills(h, G, 'farm', camp, diff); }
    return true;
  }
  if (bossCheck(h, G, enemies, diff)) return true;
  // Nothing up: help the lane with the most enemies.
  const lanes = ['top', 'mid', 'bot'];
  let bestLane = 'mid', bestN = -1;
  for (const id of lanes) {
    const n = enemies.filter(e => D.laneProject(D.LANES[id], e.x, e.y).d < 400).length;
    if (n > bestN) { bestN = n; bestLane = id; }
  }
  lane(h, G, bestLane, diff);
  return true;
}

function bossCheck(h, G, enemies, diff) {
  if (h.level < 4 || h.hp / h.maxHp < 0.6) return false;
  for (const m of G.monsters) {
    if (!m.boss || m.dead) continue;
    if (m.mtype === 'wyrm' && h.level < 9) continue;
    if (enemies.some(e => dist(e, m) < 1300)) continue;
    const helpers = G.heroes.filter(a => !a.dead && a.team === h.team && dist(a, m) < 1600).length;
    if (m.mtype === 'wyrm' && helpers < 3) continue;
    if (dist(h, m) > 2400) continue;
    if (dist(h, m) > 380) goTo(h, m.home.x, m.home.y);
    else { h.attackTarget = m; h.moveTo = null; useSkills(h, G, 'farm', m, diff); }
    return true;
  }
  return false;
}

// ----- Roam -----
function roam(h, G, allies, diff) {
  const order = [3, 2, 0, 1];
  let buddy = null;
  for (const role of order) {
    const a = allies.find(x => x.role === role && !x.recall && dist(x, D.FOUNTAIN[h.team]) > 700);
    if (a) { buddy = a; break; }
  }
  if (!buddy) return false;
  const t = buddy.attackTarget;
  if (t && !t.dead && (t.kind === 'hero' || t.kind === 'monster' && t.boss) && dist(h, t) < 900) {
    h.attackTarget = t; h.moveTo = null;
    return true;
  }
  const home = D.FOUNTAIN[h.team];
  const a = Math.atan2(home.y - buddy.y, home.x - buddy.x);
  const off = h.def.attack.melee ? 40 : 130;
  if (dist(h, buddy) > 160 || !h.moveTo) goTo(h, buddy.x + Math.cos(a) * off, buddy.y + Math.sin(a) * off);
  return true;
}

LF.ai = { think };
})(window.LF);
