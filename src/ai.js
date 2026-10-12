// Lanefall: bot brains. Each bot plays its role, fights when the odds look good, retreats and recalls
// when hurt, dodges skillshots and kites. Each team also makes shared plans: get ready for a boss,
// take it, contest the enemy's attempt, push with the Lord buff, and group up late in the game.
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
  const enemies = G.heroes.filter(e => !e.dead && e.team !== h.team && LF.sim.seen(h.team, e));
  const allies = G.heroes.filter(a => !a.dead && a.team === h.team && a !== h);
  const atHome = dist(h, home) < home.r - 40;
  // A little personality, so bots don't all play the same.
  const me = ai.p || (ai.p = { brave: 0.85 + Math.random() * 0.3, roams: Math.random() < 0.6 });
  const plan = teamPlan(G, h.team);

  if (h.recall) {
    if (enemies.some(e => dist(e, h) < 650)) h.recall = null;
    else return;
  }
  if (smiteSteal(h, G, enemies)) return;
  if (dodge(h, G, diff)) return;
  // Regen (works on the move) when hurt and no enemy hero is close.
  const safe = !enemies.some(e => dist(e, h) < 900) && G.t - h.lastCombat > 2;
  if (!h.regenCh && safe && !atHome && hp < 0.6 && h.cds.rg <= 0 && Math.random() < diff.react) sim.cast(h, 'rg', h.x, h.y);
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
    // Fighting over a boss is worth more risk.
    const atObjective = plan.boss && (plan.call === 'contest' || plan.call === 'take') && plan.members.has(h.seat) && dist(h, plan.boss.home) < 1300;
    if (target) {
      const tPct = target.hp / target.maxHp;
      const engage = mine >= theirs * diff.brave * me.brave * (atObjective ? 0.8 : 1) || (tPct < 0.25 && hp > 0.4);
      if (engage) {
        ai.mode = 'fight';
        h.attackTarget = target; h.moveTo = null;
        kite(h, G, target, diff);
        useSpell(h, G, 'fight', target, diff);
        useSkills(h, G, 'fight', target, diff);
        return;
      }
    }
    const closest = foes.reduce((a, b) => (dist(a, h) < dist(b, h) ? a : b));
    if (dist(closest, h) < 600 && mine < theirs * 0.85) {
      ai.mode = 'flee';
      useSpell(h, G, 'flee', closest, diff);
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

  // ----- Team plans: bosses, Lord pushes, late-game grouping -----
  if (objective(h, G, plan, diff)) return;

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
  else if (role === 2 && me.roams && gank(h, G, enemies, 1500, 0.45)) return;
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
  if (threat && dist(threat, h) < 520) { useSpell(h, G, 'flee', threat, diff); useSkills(h, G, 'flee', threat, diff); }
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

// Battle spell decisions.
function useSpell(h, G, mode, target, diff) {
  if (h.cds.sp > 0 || !target || Math.random() > diff.react) return;
  const sim = LF.sim, d = dist(h, target), hp = h.hp / h.maxHp, L = h.level;
  const isHero = target.kind === 'hero', tPct = target.hp / target.maxHp;
  let at = null;
  switch (h.spell) {
    case 'blink':
      if (mode === 'flee' && hp < 0.35 && d < 420) at = awayPoint(h, target);
      else if (mode === 'fight' && isHero && tPct < 0.2 && d > h.range + 80 && d < h.range + 320) at = { x: target.x, y: target.y };
      break;
    case 'smite':
      if (target.kind === 'monster' && target.hp < 450 + 40 * L && sim.gap(h, target) < 300) at = { x: target.x, y: target.y };
      break;
    case 'reap':
      if (isHero && d < 450 && target.hp < 120 + 12 * L + 0.15 * (target.maxHp - target.hp)) at = { x: target.x, y: target.y };
      break;
    case 'sprint':
      if ((mode === 'flee' && d < 500) || (mode === 'fight' && isHero && tPct < 0.3 && d > h.range + 150)) at = { x: h.x, y: h.y };
      break;
    case 'aegis': {
      const ally = G.heroes.some(a => a !== h && !a.dead && a.team === h.team && dist(a, h) < 550 && a.hp / a.maxHp < 0.3);
      if (isHero && d < 700 && (hp < 0.35 || (mode === 'fight' && ally))) at = { x: h.x, y: h.y };
      break;
    }
    case 'stonegaze':
      if (mode !== 'farm' && isHero && d < 220) at = { x: h.x, y: h.y };
      break;
    default: break;
  }
  if (at) sim.cast(h, 'sp', at.x, at.y);
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
  // Gank: a nearby enemy laner who is hurt.
  if (h.level >= 3 && gank(h, G, enemies, 1600, 0.65)) return true;
  if (camp) {
    if (dist(h, camp) > 380) goTo(h, camp.home.x, camp.home.y);
    else { h.attackTarget = camp; h.moveTo = null; useSpell(h, G, 'farm', camp, diff); useSkills(h, G, 'farm', camp, diff); }
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

// ---------------------------------------------------------------------------
// Human touches
// ---------------------------------------------------------------------------
// Go after a hurt enemy hero within `radius` who isn't under their tower.
function gank(h, G, enemies, radius, below) {
  if (h.hp / h.maxHp < 0.55) return false;
  const prey = enemies.filter(e => dist(e, h) < radius && e.hp / e.maxHp < below && !enemyTowerCovering(e, G, h.team));
  if (!prey.length) return false;
  const t = prey.reduce((a, b) => (dist(a, h) < dist(b, h) ? a : b));
  goTo(h, t.x, t.y);
  return true;
}

// Sidestep a skillshot flying at us.
function dodge(h, G, diff) {
  if (Math.random() > (diff.dodge || 0)) return false;
  for (const p of G.projs) {
    if (p.kind !== 'line' || p.team === h.team) continue;
    const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp;
    const dx = h.x - p.x, dy = h.y - p.y;
    const along = dx * ux + dy * uy;
    if (along < 0 || along > 520) continue;
    const side = dx * uy - dy * ux;
    if (Math.abs(side) > p.width / 2 + h.r + 12) continue;
    const s = side >= 0 ? 1 : -1;
    h.dodgeTo = { x: h.x + uy * s * 150, y: h.y - ux * s * 150 };
    h.dodgeUntil = G.t + 0.35;
    return true;
  }
  return false;
}

// Ranged heroes step back from melee attackers between shots.
function kite(h, G, t, diff) {
  h.kiteTo = null;
  if (h.def.attack.melee || t.kind !== 'hero' || !t.def.attack.melee) return;
  if (Math.random() > (diff.kite || 0) || dist(h, t) > h.range * 0.8) return;
  const home = D.FOUNTAIN[h.team];
  const a = Math.atan2(h.y - t.y, h.x - t.x), b = Math.atan2(home.y - h.y, home.x - h.x);
  const dir = Math.atan2(Math.sin(a) * 2 + Math.sin(b), Math.cos(a) * 2 + Math.cos(b));
  h.kiteTo = { x: h.x + Math.cos(dir) * 140, y: h.y + Math.sin(dir) * 140 };
  h.kiteUntil = G.t + 0.6;
}

// Last-second Smite on a boss or buff an enemy is fighting for, or any boss we're taking.
function smiteSteal(h, G, enemies) {
  if (h.spell !== 'smite' || h.cds.sp > 0) return false;
  const dmg = 450 + 40 * h.level;
  for (const m of G.monsters) {
    if (m.dead || m.hp > dmg || LF.sim.gap(h, m) > 300) continue;
    const def = D.MONSTERS[m.mtype];
    if (!m.boss && !def.buff) continue;
    if (m.boss || enemies.some(e => dist(e, m) < 700)) { LF.sim.cast(h, 'sp', m.x, m.y); return true; }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Team plans, refreshed about once a second per team.
//   prep    : a boss spawns soon; the jungler and roamer (and mid for the Lord) wait by the pit
//   take    : the boss is up and it's safe enough; send a group to kill it
//   contest : the enemy is on the boss; everyone healthy and close enough goes to fight them for it
//   push    : we have the Lord buff; push a lane together until one tower falls
//   group   : from 14:00; group up and push one lane, the EXP laner keeps splitting
// ---------------------------------------------------------------------------
function teamPlan(G, team) {
  const P = G.aiPlan || (G.aiPlan = [{ t: -9 }, { t: -9 }]);
  if (G.t - P[team].t < 1) return P[team];
  const plan = { t: G.t, call: null, boss: null, members: new Set(), lane: null };
  P[team] = plan;
  const allies = G.heroes.filter(a => !a.dead && a.team === team);
  const foesAlive = G.heroes.filter(e => !e.dead && e.team !== team);
  const seenFoes = foesAlive.filter(e => LF.sim.seen(team, e));
  if (!allies.length) return plan;
  const avgLvl = allies.reduce((s, a) => s + a.level, 0) / allies.length;
  const healthy = (a, min) => a.hp / a.maxHp > min && a.ai.state !== 'heal';
  const bosses = G.monsters.filter(m => m.boss);
  const boss = bosses.find(m => !m.dead);
  const pit = (boss || bosses[0]).home;
  const near = (list, r) => list.filter(u => dist(u, pit) < r);
  const byDist = list => list.slice().sort((a, b) => dist(a, pit) - dist(b, pit));

  if (boss) {
    const lord = boss.mtype === 'wyrm';
    const foesAtPit = near(seenFoes, 950);
    const enemyOnIt = foesAtPit.length && (boss.hp < boss.maxHp * 0.97 || (boss.target && boss.target.kind === 'hero' && boss.target.team !== team));
    if (enemyOnIt) {
      const can = allies.filter(a => healthy(a, 0.35) && dist(a, pit) < 3400);
      if (can.length >= 2 && can.length >= foesAtPit.length - (lord ? 0 : 1)) {
        plan.call = 'contest'; plan.boss = boss;
        can.forEach(a => plan.members.add(a.seat));
      }
    } else {
      const outnumbered = near(seenFoes, 1500).length > near(allies, 1500).length + 1;
      const readyT = !lord && avgLvl >= 3 && !outnumbered;
      const readyL = lord && avgLvl >= 9 && allies.length >= 3 && (allies.length >= foesAlive.length || foesAlive.length <= 3) && !outnumbered;
      if (readyT || readyL) {
        plan.call = 'take'; plan.boss = boss;
        const crew = lord
          ? allies.filter(a => healthy(a, 0.45) && dist(a, pit) < 4200)
          : allies.filter(a => healthy(a, 0.45) && (a.role === 1 || a.role === 4)).concat(byDist(allies.filter(a => healthy(a, 0.5) && (a.role === 0 || a.role === 2) && dist(a, pit) < 2600)).slice(0, 1));
        if (crew.length >= (lord ? 3 : 2)) crew.forEach(a => plan.members.add(a.seat));
        else plan.call = null;
      }
    }
  } else {
    const soon = bosses.filter(m => m.respawnAt !== Infinity && m.respawnAt - G.t < 22 && m.respawnAt - G.t > -1 &&
      !(D.MONSTERS[m.mtype].until && m.respawnAt >= D.MONSTERS[m.mtype].until)).sort((a, b) => a.respawnAt - b.respawnAt)[0];
    if (soon && avgLvl >= (soon.mtype === 'wyrm' ? 8 : 2)) {
      plan.call = 'prep'; plan.boss = soon;
      allies.filter(a => healthy(a, 0.4) && (a.role === 1 || a.role === 4 || (soon.mtype === 'wyrm' && a.role === 2))).forEach(a => plan.members.add(a.seat));
    }
  }
  // A Lord push aims for one tower: once a tower falls during the buff, the team goes back to normal play.
  const towersLeft = G.structs.filter(st => !st.dead && st.team !== team && st.kind !== 'core').length;
  const LP = G.aiLordPush || (G.aiLordPush = [{ until: 0 }, { until: 0 }]);
  if (G.teamBuff[team] > G.t && LP[team].until !== G.teamBuff[team]) LP[team] = { until: G.teamBuff[team], towers: towersLeft };
  const lordPush = G.teamBuff[team] > G.t && towersLeft >= LP[team].towers;
  if (!plan.call && (lordPush || G.t > 840)) {
    plan.call = lordPush ? 'push' : 'group';
    plan.lane = pushLane(G, team, allies);
    allies.filter(a => healthy(a, 0.45) && (plan.call === 'push' || a.role !== 0)).forEach(a => plan.members.add(a.seat));
  }
  return plan;
}
// The lane to push together: the one whose next enemy tower is closest to falling, else mid.
function pushLane(G, team, allies) {
  let best = 'mid', score = Infinity;
  for (const id of ['top', 'mid', 'bot']) {
    const towers = G.structs.filter(s => !s.dead && s.team !== team && s.lane === id);
    if (!towers.length) return id;
    const s = towers.length * 2 + Math.min(...towers.map(t => t.hp / t.maxHp)) - allies.filter(a => D.laneProject(D.LANES[id], a.x, a.y).d < 500).length * 0.3;
    if (s < score) { score = s; best = id; }
  }
  return best;
}
function objective(h, G, plan, diff) {
  if (!plan.call || !plan.members.has(h.seat) || h.ai.state === 'heal') return false;
  const m = plan.boss;
  if (plan.call === 'prep') {
    // Wait just outside the pit on our side.
    const home = D.FOUNTAIN[h.team], a = Math.atan2(home.y - m.home.y, home.x - m.home.x);
    const spot = { x: m.home.x + Math.cos(a) * 520 + (h.seat % 3 - 1) * 60, y: m.home.y + Math.sin(a) * 520 };
    if (dist(h, spot) > 120) goTo(h, spot.x, spot.y); else { h.moveTo = null; h.attackTarget = null; }
    return true;
  }
  if (plan.call === 'take' || plan.call === 'contest') {
    if (m.dead) return false;
    const reach = h.range + m.r + (h.def.attack.melee ? 20 : 60);
    if (dist(h, m) > reach + 200) goTo(h, m.x, m.y);
    else { h.attackTarget = m; h.moveTo = null; useSpell(h, G, 'farm', m, diff); useSkills(h, G, 'farm', m, diff); }
    return true;
  }
  // push / group
  lane(h, G, plan.lane, diff);
  return true;
}

LF.ai = { think, teamPlan };
})(window.LF);
