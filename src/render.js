// Lanefall: renderer. Draws a "view" of the game: the live simulation in single player and
// on the host, or the mirrored state a multiplayer client rebuilds from snapshots.
'use strict';
(function (LF) {
const D = LF.data, A = LF.art;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

let canvas, ctx, mini, mctx, terrain, miniTerrain;
let cw = 0, ch = 0, dpr = 1, scale = 1;
const cam = { x: 1800, y: 1800, shake: 0, flip: false };
let fx = [];          // local visual effects
let texts = [];       // floating numbers
let lastEvSeq = 0;
let now = 0;

function init(c, m) {
  canvas = c; ctx = c.getContext('2d');
  mini = m; mctx = m.getContext('2d');
  terrain = A.buildTerrain();
  miniTerrain = document.createElement('canvas');
  miniTerrain.width = miniTerrain.height = 360;
  const g = miniTerrain.getContext('2d');
  g.drawImage(terrain, 0, 0, 360, 360);
  resize();
}

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = canvas.clientWidth; ch = canvas.clientHeight;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  scale = clamp(Math.min(cw / 1500, ch / 860), 0.48, 1.15);
  if (mini) { mini.width = Math.round(mini.clientWidth * dpr); mini.height = Math.round(mini.clientHeight * dpr); }
}

function reset() { fx = []; texts = []; lastEvSeq = 0; cam.shake = 0; }

const screenToWorld = (sx, sy) => {
  let x = (sx - cw / 2) / scale, y = (sy - ch / 2) / scale;
  if (cam.flip) { const t = x; x = y; y = t; }
  return { x: x + cam.x, y: y + cam.y };
};
// Screen-space direction (e.g. joystick) to world direction.
const dirToWorld = (dx, dy) => (cam.flip ? { x: dy, y: dx } : { x: dx, y: dy });
const viewAng = a => (cam.flip ? Math.PI / 2 - a : a);
const viewY = u => (cam.flip ? u.x : u.y);

function follow(target, dt) {
  const k = 1 - Math.exp(-dt * 7);
  cam.x += (target.x - cam.x) * k; cam.y += (target.y - cam.y) * k;
  const vw = cw / scale, vh = ch / scale;
  const ex = cam.flip ? vh : vw, ey = cam.flip ? vw : vh;
  cam.x = ex >= D.W ? D.W / 2 : clamp(cam.x, ex / 2, D.W - ex / 2);
  cam.y = ey >= D.H ? D.H / 2 : clamp(cam.y, ey / 2, D.H - ey / 2);
  cam.shake = Math.max(0, cam.shake - dt * 30);
}
function snap(p) { cam.x = p.x; cam.y = p.y; }

// ---------------------------------------------------------------------------
// Per-entity animation state
// ---------------------------------------------------------------------------
function anim(u) {
  let a = u._a;
  if (!a) a = u._a = { phase: Math.random() * 6, walk: 0, px: u.x, py: u.y, atkN: u.atkN, atkT: -9, castN: u.castN, castT: -9, hp: u.hp, hurt: 0, deadT: u.dead ? -9 : null, wasDead: u.dead };
  return a;
}

function stepAnim(u, dt, view) {
  const a = anim(u);
  const moved = Math.hypot(u.x - a.px, u.y - a.py) / Math.max(dt, 1e-3);
  a.px = u.x; a.py = u.y;
  const target = clamp(moved / 140, 0, 1);
  a.walk += (target - a.walk) * Math.min(1, dt * 10);
  a.phase += dt * Math.min(moved, 420) / (u.kind === 'hero' ? 8.5 : 6.5);
  if (u.atkN !== a.atkN) { a.atkN = u.atkN; a.atkT = now; if (view.onAttack) view.onAttack(u); }
  if (u.castN !== a.castN) { a.castN = u.castN; a.castT = now; }
  if (u.dead && !a.wasDead) { a.deadT = now; a.wasDead = true; }
  else if (!u.dead && a.wasDead) { a.wasDead = false; a.deadT = null; a.hp = u.hp; }
  if (!u.dead && u.hp < a.hp - 0.5) {
    const lost = a.hp - u.hp;
    a.hurt = 1;
    if (u.kind === 'hero') {
      const mine = view.player && u === view.player;
      addText(u.x + (Math.random() - 0.5) * 30, u.y - 86, Math.round(lost), mine ? '#ff7a7a' : lost > 250 ? '#ffd24a' : '#ffffff', lost > 250 ? 30 : 22);
    } else if (view.player && view.player.attackTarget === u) {
      addText(u.x + (Math.random() - 0.5) * 20, u.y - 46, Math.round(lost), '#f4f4f4', 17);
    }
    if (LF.audio && view.player && u === view.player) LF.audio.play('hurt', 0.4);
  } else if (!u.dead && u.kind === 'hero' && u.hp > a.hp + 25) {
    addText(u.x, u.y - 94, '+' + Math.round(u.hp - a.hp), '#7be38a', 20);
  }
  a.hp = u.hp;
  a.hurt = Math.max(0, a.hurt - dt * 6);
}

function pose(u, a) {
  const atk = now - a.atkT < 0.34 ? (now - a.atkT) / 0.34 : -1;
  const cast = now - a.castT < 0.4 ? (now - a.castT) / 0.4 : -1;
  const f = viewAng(u.facing || 0);
  const right = Math.cos(f) >= 0;
  const aimLocal = Math.atan2(Math.sin(f), Math.abs(Math.cos(f)));
  return {
    right,
    p: {
      t: now + (u.id || 0) * 0.37, walk: a.walk, phase: a.phase, atk, cast, aim: aimLocal,
      melee: !!(u.def ? u.def.attack.melee : u.mtype === 'melee'), hurt: a.hurt,
      dead: a.deadT != null ? clamp((now - a.deadT) / 0.7, 0, 1) : 0,
      air: u.air || 0, stun: (u.stunT || 0) > 0 && !u.dead,
    },
  };
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
function addText(x, y, text, color, size) { texts.push({ x, y, text: String(text), color, size, t: 0, life: 1 }); if (texts.length > 80) texts.shift(); }
function ring(x, y, r0, r1, color, life, width) { fx.push({ k: 'ring', x, y, r0, r1, color, t: 0, life, width: width || 5 }); }
function burst(x, y, color, n, speed, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = (0.3 + Math.random() * 0.7) * speed;
    fx.push({ k: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: (life || 0.6) * (0.6 + Math.random() * 0.6), color, size: 2 + Math.random() * 4 });
  }
  if (fx.length > 900) fx.splice(0, fx.length - 900);
}
function shake(n) { cam.shake = Math.max(cam.shake, n); }

const VIS_COLOR = {
  cleave: '#ffb27a', slam: '#ffcf7a', pounce: '#ff8a6a', knives: '#9ff0e6', roar: '#f0e0a0', bloom: '#9cf0b0',
  shot: '#ffe08a', claw: '#ff7a6a', field: '#ffe7a0', star: '#fff0b0', quake: '#c9a36a', buff: '#ffffff',
};

// Turn simulation events into visuals and sound.
function consumeEvents(view) {
  const evs = view.events || [];
  for (const e of evs) {
    if (e.seq <= lastEvSeq) continue;
    lastEvSeq = e.seq;
    const near = e.x !== undefined ? Math.hypot(e.x - cam.x, e.y - cam.y) < 1300 : true;
    const T = D.TEAMS[e.team !== undefined && e.team < 3 ? e.team : 2];
    switch (e.type) {
      case 'fx': {
        const col = VIS_COLOR[e.vis] || T.light;
        if (e.vis === 'impact') { burst(e.x, e.y, T.light, 10, 260, 0.4); ring(e.x, e.y, 6, 40, T.light, 0.25, 4); }
        else if (e.vis === 'blink') { burst(e.x, e.y - 30, '#c9a2ff', 16, 200); burst(e.x2, e.y2 - 30, '#e8d6ff', 16, 200); ring(e.x2, e.y2, 10, 70, '#c9a2ff', 0.35); }
        else if (e.vis === 'execute') { fx.push({ k: 'slash', x: e.x, y: e.y - 30, t: 0, life: 0.4, color: '#e8fffb', ang: 0.6, len: 110 }); fx.push({ k: 'slash', x: e.x, y: e.y - 30, t: 0, life: 0.4, color: '#7ad1c9', ang: -0.6, len: 110 }); burst(e.x, e.y - 30, '#7ad1c9', 20, 300); shake(6); }
        else if (e.vis === 'buff') { for (let i = 0; i < 14; i++) fx.push({ k: 'rise', x: e.x + (Math.random() - 0.5) * 50, y: e.y, t: 0, life: 0.7 + Math.random() * 0.4, color: T.light }); }
        else if (e.vis === 'shot' || e.vis === 'claw') {
          fx.push({ k: 'cone', x: e.x, y: e.y, r: e.r, ang: e.ang, angle: e.angle, t: 0, life: 0.3, color: col });
          burst(e.x + Math.cos(e.ang) * e.r * 0.5, e.y + Math.sin(e.ang) * e.r * 0.5, col, 14, 280, 0.35);
        } else {
          const big = e.vis === 'star' || e.vis === 'quake' || e.vis === 'slam';
          ring(e.x, e.y, 10, e.r || 120, col, big ? 0.55 : 0.4, big ? 10 : 6);
          if (e.vis === 'star') { ring(e.x, e.y, 20, e.r * 1.25, '#ffffff', 0.7, 4); burst(e.x, e.y, '#ffe6a0', 50, 520, 0.8); burst(e.x, e.y, T.light, 24, 320); shake(near ? 12 : 0); }
          else if (e.vis === 'quake') { for (let i = 0; i < 9; i++) fx.push({ k: 'crack', x: e.x, y: e.y, ang: i / 9 * TAU + Math.random() * 0.3, len: e.r * (0.6 + Math.random() * 0.4), t: 0, life: 0.9 }); burst(e.x, e.y, '#a88a5a', 30, 300); shake(near ? 10 : 0); }
          else if (e.vis === 'field') { burst(e.x, e.y, '#fff0b0', 30, 340); }
          else if (e.vis === 'cleave' || e.vis === 'knives') { fx.push({ k: 'spin', x: e.x, y: e.y - 24, r: e.r * 0.8, t: 0, life: 0.3, color: col }); burst(e.x, e.y - 20, col, 18, e.r * 1.6, 0.35); }
          else if (e.vis === 'bloom') { for (let i = 0; i < 24; i++) fx.push({ k: 'petal', x: e.x, y: e.y - 20, a: i / 24 * TAU, r: e.r, t: 0, life: 0.7 }); }
          else burst(e.x, e.y - 10, col, 22, 300, 0.5);
          if (near && LF.audio) LF.audio.play(big ? 'boom' : 'whoosh', big ? 0.7 : 0.4);
        }
        break;
      }
      case 'cast': {
        const h = view.heroes[e.seat];
        if (h && LF.audio && Math.hypot(h.x - cam.x, h.y - cam.y) < 1100) LF.audio.play(e.key === 'ult' ? 'ult' : 'cast', h === view.player ? 0.6 : 0.3);
        break;
      }
      case 'kill': {
        burst(e.x, e.y - 30, D.TEAMS[1 - e.team].color, 30, 300, 0.9);
        ring(e.x, e.y, 10, 120, '#ffffff', 0.5, 6);
        break;
      }
      case 'tower': {
        burst(e.x, e.y - 60, '#9aa2a9', 40, 380, 1); burst(e.x, e.y - 90, D.TEAMS[e.team].light, 40, 420, 1);
        ring(e.x, e.y, 20, 260, '#ffffff', 0.7, 10); shake(14);
        if (LF.audio) LF.audio.play('tower', 0.8);
        break;
      }
      case 'gold': {
        if (view.player && e.seat === view.player.seat) { addText(e.x, e.y - 40, '+' + Math.round(e.amt), '#f2c14e', 20); if (LF.audio) LF.audio.play('gold', 0.25); }
        break;
      }
      case 'level': {
        const h = view.heroes[e.seat];
        if (!h) break;
        ring(h.x, h.y, 20, 110, '#f2c14e', 0.7, 6);
        for (let i = 0; i < 18; i++) fx.push({ k: 'rise', x: h.x + (Math.random() - 0.5) * 60, y: h.y, t: 0, life: 0.9, color: '#ffe08a' });
        if (h === view.player) { addText(h.x, h.y - 120, 'Level ' + e.level, '#ffd76a', 30); if (LF.audio) LF.audio.play('level', 0.6); }
        break;
      }
      case 'recalled': case 'respawn': {
        const h = view.heroes[e.seat];
        if (h) { ring(h.x, h.y, 10, 90, D.TEAMS[h.team].light, 0.6, 6); burst(h.x, h.y - 30, D.TEAMS[h.team].light, 20, 200); }
        break;
      }
      default: break;
    }
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function setWorldTransform() {
  const s = scale * dpr;
  const sx = cam.shake ? (Math.random() - 0.5) * cam.shake * 2 : 0, sy = cam.shake ? (Math.random() - 0.5) * cam.shake * 2 : 0;
  ctx.setTransform(s, 0, 0, s, dpr * cw / 2 + sx * dpr, dpr * ch / 2 + sy * dpr);
  if (cam.flip) ctx.transform(0, 1, 1, 0, 0, 0);
  ctx.translate(-cam.x, -cam.y);
}
// Local upright frame at a world point (undoes the flip so sprites and text stay upright).
function upright(x, y) {
  ctx.save();
  ctx.translate(x, y);
  if (cam.flip) ctx.transform(0, 1, 1, 0, 0, 0);
}

function heroFlags(h) {
  if (h.flags !== undefined) return h.flags;
  let f = 0;
  if (h.buffs) for (const b of h.buffs) { if (b.id === 'azure') f |= 1; if (b.id === 'ember') f |= 2; }
  return f;
}

function draw(view, dt, opts) {
  now += dt;
  consumeEvents(view);
  const player = view.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0c140f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  setWorldTransform();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(terrain, 0, 0, D.W, D.H);

  const vw = cw / scale, vh = ch / scale;
  const margin = 260;
  const ext = Math.max(vw, vh) / 2 + margin;
  const onScreen = (x, y) => Math.abs(x - cam.x) < ext && Math.abs(y - cam.y) < ext;
  const uiK = Math.max(1, 0.78 / scale);

  // Fountain shimmer
  for (const team of [0, 1]) {
    const f = D.FOUNTAIN[team];
    ctx.strokeStyle = A.rgba(D.TEAMS[team].color, 0.3 + 0.15 * Math.sin(now * 2.5));
    ctx.lineWidth = 5; A.circle(ctx, f.x, f.y, f.r); ctx.stroke();
  }

  // Zones on the ground
  for (const z of view.zones) drawZoneGround(z);

  // Enemy tower ranges near the player
  if (player && !player.dead) {
    for (const s of view.structs) {
      if (s.dead || s.team === player.team) continue;
      const R = s.range + s.r;
      if (Math.hypot(player.x - s.x, player.y - s.y) > R + 300) continue;
      const aggro = s.target === player || s.targetSeat === player.seat;
      ctx.strokeStyle = aggro ? 'rgba(255,80,90,0.95)' : 'rgba(255,80,90,0.45)';
      ctx.lineWidth = aggro ? 5 : 3;
      ctx.setLineDash(aggro ? [] : [18, 12]);
      A.circle(ctx, s.x, s.y, R); ctx.stroke();
      ctx.setLineDash([]);
      if (aggro) { ctx.fillStyle = 'rgba(255,60,70,0.06)'; A.circle(ctx, s.x, s.y, R); ctx.fill(); }
    }
  }

  // Aim indicator and target ring
  if (opts && opts.aim && player && !player.dead) drawAim(player, opts.aim);
  if (player && player.attackTarget && !player.attackTarget.dead) {
    const t = player.attackTarget;
    ctx.strokeStyle = 'rgba(255,90,90,0.9)'; ctx.lineWidth = 3;
    A.ellipse(ctx, t.x, t.y, t.r * 1.5, t.r * 1.5); ctx.stroke();
  }
  const clickAge = opts && opts.click ? performance.now() / 1000 - opts.click.t : 9;
  if (clickAge < 0.45) {
    const q = clickAge / 0.45;
    ctx.strokeStyle = `rgba(123,227,138,${1 - q})`; ctx.lineWidth = 3;
    A.circle(ctx, opts.click.x, opts.click.y, 26 * (1 - q * 0.6)); ctx.stroke();
  }

  // Entities y-sorted (in view space)
  const list = [];
  for (const s of view.structs) if (onScreen(s.x, s.y)) list.push(s);
  for (const m of view.minions) if (onScreen(m.x, m.y)) list.push(m);
  for (const m of view.monsters) if ((!m.dead || anim(m).deadT != null && now - anim(m).deadT < 1) && onScreen(m.x, m.y)) list.push(m);
  for (const h of view.heroes) if (onScreen(h.x, h.y) && (!h.dead || (anim(h).deadT != null && now - anim(h).deadT < 1.4))) list.push(h);
  for (const o of D.OBSTACLES) if (onScreen(o.x, o.y)) list.push(o);
  for (const u of view.minions) stepAnim(u, dt, view);
  for (const u of view.monsters) stepAnim(u, dt, view);
  for (const u of view.heroes) stepAnim(u, dt, view);
  list.sort((a, b) => viewY(a) - viewY(b));
  for (const u of list) {
    if (u.kind === 'tree' || u.kind === 'rock') { upright(u.x, u.y); A.drawObstacle(ctx, u, now); ctx.restore(); continue; }
    if (u.kind === 'tower' || u.kind === 'core') { drawStructure(u, player); continue; }
    drawUnit(u, player);
  }

  // Projectiles
  for (const p of view.projs) if (onScreen(p.x, p.y)) drawProj(p);
  // Zones above ground (falling things)
  for (const z of view.zones) drawZoneAir(z);
  // Particles and rings
  drawFx(dt);
  // Bars, names
  for (const u of list) if (u.kind !== 'tree' && u.kind !== 'rock') drawBars(u, player, uiK, view);
  // Floating texts
  for (const t of texts) {
    t.t += dt; t.y -= 46 * dt;
    const q = t.t / t.life;
    upright(t.x, t.y);
    ctx.globalAlpha = q < 0.65 ? 1 : 1 - (q - 0.65) / 0.35;
    const sc = q < 0.12 ? 0.6 + q / 0.12 * 0.5 : 1.1 - Math.min(0.1, (q - 0.12));
    ctx.font = `600 ${t.size * uiK * sc}px Teko, 'Arial Narrow', sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4 * uiK; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.color; ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  texts = texts.filter(t => t.t < t.life);
}

function drawUnit(u, player) {
  const a = anim(u);
  const { right, p } = pose(u, a);
  // Shadow and team ring stay on the ground
  upright(u.x, u.y);
  const r = u.kind === 'hero' ? 26 : u.r;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  A.ellipse(ctx, 0, 2, r * (u.boss ? 1.3 : 1.05), r * 0.42); ctx.fill();
  if (u.kind === 'hero' && !u.dead) {
    const self = player && u === player;
    ctx.strokeStyle = self ? '#7be38a' : D.TEAMS[u.team].color;
    ctx.lineWidth = self ? 3.5 : 2.5;
    A.ellipse(ctx, 0, 2, r * 1.3, r * 0.55); ctx.stroke();
    const fl = heroFlags(u);
    if (fl & 1) { ctx.strokeStyle = 'rgba(110,200,255,0.8)'; ctx.lineWidth = 2; A.ellipse(ctx, 0, 2, r * 1.5, r * 0.65); ctx.stroke(); }
    if (fl & 2) { ctx.strokeStyle = 'rgba(255,140,60,0.8)'; ctx.lineWidth = 2; A.ellipse(ctx, 0, 2, r * 1.6, r * 0.7); ctx.stroke(); }
  }
  if (u.recall) {
    const k = Math.min(1, (u.recall.t || 0) / 3.5);
    ctx.strokeStyle = A.rgba(D.TEAMS[u.team].light, 0.9); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 2, 40, 17, 0, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
    const g = ctx.createLinearGradient(0, 0, 0, -160);
    g.addColorStop(0, A.rgba(D.TEAMS[u.team].color, 0.5)); g.addColorStop(1, A.rgba(D.TEAMS[u.team].color, 0));
    ctx.fillStyle = g; ctx.fillRect(-30, -160, 60, 160);
  }
  if (!right) ctx.scale(-1, 1);
  if (u.kind === 'hero') {
    if (u.shield > 1) { A.glow(ctx, 0, -38 - (u.air || 0), 46, '#dff4ff', 0.35); }
    A.drawRig(ctx, u.def.look, p);
    if ((u.rootT || 0) > 0) { ctx.strokeStyle = '#6bbf4a'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, -10, 22 + i * 3, Math.PI * 0.1 + i, Math.PI * 0.9 + i); ctx.stroke(); } }
  } else if (u.kind === 'minion') {
    if (u.mtype === 'siege') A.drawSiege(ctx, u.team, now, a.walk, p.atk);
    else A.drawRig(ctx, A.getMinionLook(u.team, u.mtype), p);
  } else if (u.kind === 'monster') {
    A.drawMonster(ctx, u, now, p);
  }
  ctx.restore();
}

function drawStructure(s, player) {
  upright(s.x, s.y);
  if (s.kind === 'core') A.drawCore(ctx, s, now); else A.drawTower(ctx, s, now);
  const guarded = s.guarded !== undefined ? s.guarded : !LF.sim.isTargetable(s) && !s.dead;
  if (guarded) {
    ctx.strokeStyle = A.rgba(D.TEAMS[s.team].light, 0.35); ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
    A.ellipse(ctx, 0, 0, s.r + 18, (s.r + 18) * 0.5); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawBars(u, player, k, view) {
  if (u.dead) return;
  const isHero = u.kind === 'hero';
  let w, h, y;
  if (isHero) { w = 76; h = 9; y = -98 - (u.air || 0); }
  else if (u.kind === 'minion') { w = 34; h = 4; y = u.mtype === 'siege' ? -54 : -48; }
  else if (u.kind === 'monster') { if (u.hp >= u.maxHp && !u.boss) return; w = u.boss ? 120 : 64; h = u.boss ? 9 : 6; y = u.mtype === 'wisp' ? -100 : u.boss ? -130 : -62; }
  else { w = u.kind === 'core' ? 130 : 96; h = 9; y = u.kind === 'core' ? -150 : -132; }
  w *= k; h *= k;
  upright(u.x, u.y);
  const x = -w / 2;
  const mine = player && u === player;
  const color = mine ? '#6fdc6a' : u.team === 2 ? '#e2b84a' : player && u.team === player.team ? '#4aa8ff' : '#ff4f5e';
  ctx.fillStyle = 'rgba(6,9,8,0.88)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4 + (isHero ? 5 * k : 0));
  const hpw = w * clamp(u.hp / u.maxHp, 0, 1);
  ctx.fillStyle = color; ctx.fillRect(x, y, hpw, h);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, hpw, h * 0.35);
  if (isHero) {
    if (u.shield > 1) { ctx.fillStyle = '#e9f4ff'; ctx.fillRect(x + hpw, y, Math.min(w - hpw, w * u.shield / u.maxHp), h); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 500; i < u.maxHp; i += 500) ctx.fillRect(x + w * i / u.maxHp, y, 1.2, h * 0.65);
    ctx.fillStyle = '#6d8dff'; ctx.fillRect(x, y + h + 1.5, w * clamp(u.mana / u.maxMana, 0, 1), 3.2 * k);
    // Level badge
    ctx.fillStyle = 'rgba(6,9,8,0.95)';
    A.rrect(ctx, x - 22 * k, y - 4 * k, 19 * k, 17 * k, 3 * k); ctx.fill();
    ctx.fillStyle = '#f2d27a'; ctx.font = `600 ${15 * k}px Teko, 'Arial Narrow', sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(u.level, x - 12.5 * k, y + 10 * k);
    ctx.font = `600 ${11.5 * k}px Barlow, system-ui, sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const label = u.name || u.def.name;
    ctx.strokeText(label, 0, y - 6 * k);
    ctx.fillStyle = mine ? '#c9ffc4' : 'rgba(255,255,255,0.92)';
    ctx.fillText(label, 0, y - 6 * k);
  }
  ctx.restore();
}

function drawProj(p) {
  const T = D.TEAMS[p.team] || D.TEAMS[2];
  upright(p.x, p.y);
  ctx.rotate(viewAng(p.ang || 0));
  switch (p.vis) {
    case 'arrow': case 'bigarrow': {
      const big = p.vis === 'bigarrow' || p.big;
      if (big) { A.glow(ctx, 0, 0, 30, '#c8ffd6', 0.6); }
      ctx.strokeStyle = big ? '#e8fff0' : '#e4d6b0'; ctx.lineWidth = big ? 4 : 2.5;
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(8, -4); ctx.lineTo(8, 4); ctx.fill();
      ctx.fillStyle = '#5fbf7a'; ctx.fillRect(-28, -3, 6, 6);
      if (big) { ctx.strokeStyle = 'rgba(160,255,190,0.4)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(-80, 0); ctx.lineTo(-20, 0); ctx.stroke(); }
      break;
    }
    case 'bullet': {
      ctx.strokeStyle = 'rgba(255,220,130,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = '#fff3c4'; A.ellipse(ctx, 0, 0, 6, 3); ctx.fill();
      if (p.big) A.glow(ctx, 0, 0, 18, '#ffd36b', 0.7);
      break;
    }
    case 'snipe': {
      ctx.strokeStyle = 'rgba(255,200,100,0.35)'; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(-200, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-120, 0); ctx.lineTo(10, 0); ctx.stroke();
      A.glow(ctx, 0, 0, 30, '#ffcf6a', 0.9);
      break;
    }
    case 'light': case 'bolt': {
      const big = p.vis === 'bolt';
      A.glow(ctx, 0, 0, big ? 40 : 22, '#ffe7a0', 0.8);
      ctx.strokeStyle = 'rgba(255,240,180,0.5)'; ctx.lineWidth = big ? 14 : 7; ctx.beginPath(); ctx.moveTo(big ? -70 : -34, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = '#fffdf0'; A.circle(ctx, 0, 0, big ? 9 : 5); ctx.fill();
      break;
    }
    case 'hex': case 'hexorb': {
      const big = p.vis === 'hexorb';
      A.glow(ctx, 0, 0, big ? 44 : 22, '#b98cff', 0.85);
      ctx.fillStyle = '#2a1640'; A.circle(ctx, 0, 0, big ? 11 : 6); ctx.fill();
      ctx.strokeStyle = '#e2ccff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, big ? 14 : 8, now * 8, now * 8 + 4); ctx.stroke();
      break;
    }
    case 'petal': case 'snare': {
      const big = p.vis === 'snare';
      A.glow(ctx, 0, 0, big ? 34 : 20, '#a6f0b8', 0.7);
      ctx.fillStyle = big ? '#4f9a4a' : '#f7a6c1';
      ctx.save(); ctx.rotate(now * 10); A.ellipse(ctx, 0, 0, big ? 10 : 7, big ? 6 : 4); ctx.fill(); ctx.restore();
      if (big) { ctx.strokeStyle = '#7fd66a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-30, -6); ctx.quadraticCurveTo(-15, 8, 0, 0); ctx.stroke(); }
      break;
    }
    case 'spear': {
      A.glow(ctx, 0, 0, 30, '#bcd8ff', 0.6);
      ctx.strokeStyle = 'rgba(200,225,255,0.85)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(12, 0); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(10, -6); ctx.lineTo(10, 6); ctx.fill();
      break;
    }
    case 'tower': {
      A.glow(ctx, 0, 0, 30, T.color, 0.8);
      ctx.strokeStyle = A.rgba(T.color, 0.5); ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = T.light; A.diamond(ctx, 0, 6, 7, 10); ctx.fill();
      break;
    }
    case 'cannon': {
      ctx.fillStyle = '#2b2f33'; A.circle(ctx, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(200,200,200,0.3)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-6, 0); ctx.stroke();
      break;
    }
    default: {
      A.glow(ctx, 0, 0, 14, T.color, 0.7);
      ctx.fillStyle = T.light; A.circle(ctx, 0, 0, 4.5); ctx.fill();
    }
  }
  ctx.restore();
}

function drawZoneGround(z) {
  const T = D.TEAMS[z.team];
  if (z.kind === 'circle') {
    const q = clamp(z.t / z.delay, 0, 1);
    ctx.fillStyle = A.rgba(T.color, 0.12 + q * 0.1);
    A.circle(ctx, z.x, z.y, z.r); ctx.fill();
    ctx.strokeStyle = A.rgba(T.light, 0.85); ctx.lineWidth = 4;
    A.circle(ctx, z.x, z.y, z.r); ctx.stroke();
    ctx.fillStyle = A.rgba(z.vis === 'quake' ? '#c9a36a' : '#fff0b0', 0.25);
    A.circle(ctx, z.x, z.y, z.r * q); ctx.fill();
    return;
  }
  const fade = Math.min(1, z.t / 0.2, (z.dur - z.t) / 0.3);
  ctx.globalAlpha = clamp(fade, 0, 1);
  if (z.vis === 'rift') {
    const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    g.addColorStop(0, 'rgba(20,0,40,0.75)'); g.addColorStop(0.7, 'rgba(110,50,180,0.35)'); g.addColorStop(1, 'rgba(160,100,255,0.05)');
    ctx.fillStyle = g; A.circle(ctx, z.x, z.y, z.r); ctx.fill();
    ctx.strokeStyle = 'rgba(200,160,255,0.7)'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.3 + i * 0.18), now * (2 + i) + i, now * (2 + i) + i + 2.2); ctx.stroke(); }
  } else if (z.vis === 'sanctuary') {
    ctx.fillStyle = 'rgba(120,230,150,0.18)'; A.circle(ctx, z.x, z.y, z.r); ctx.fill();
    ctx.strokeStyle = 'rgba(160,255,180,0.8)'; ctx.lineWidth = 4; A.circle(ctx, z.x, z.y, z.r); ctx.stroke();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + now * 0.5; ctx.fillStyle = '#f7a6c1'; A.circle(ctx, z.x + Math.cos(a) * z.r * 0.85, z.y + Math.sin(a) * z.r * 0.85, 6); ctx.fill(); }
    if (Math.random() < 0.3) fx.push({ k: 'rise', x: z.x + (Math.random() - 0.5) * z.r * 1.5, y: z.y + (Math.random() - 0.5) * z.r, t: 0, life: 0.8, color: '#b6ffc8' });
  } else if (z.vis === 'rain') {
    ctx.fillStyle = 'rgba(160,255,190,0.12)'; A.circle(ctx, z.x, z.y, z.r); ctx.fill();
    ctx.strokeStyle = 'rgba(160,255,190,0.6)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); A.circle(ctx, z.x, z.y, z.r); ctx.stroke(); ctx.setLineDash([]);
  } else if (z.vis === 'whirl') {
    ctx.strokeStyle = 'rgba(190,220,255,0.75)'; ctx.lineWidth = 5;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.6 + i * 0.15), now * 12 + i * 2, now * 12 + i * 2 + 1.6); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}

function drawZoneAir(z) {
  if (z.kind === 'circle' && z.vis === 'star') {
    const q = clamp(z.t / z.delay, 0, 1);
    const y = z.y - (1 - q) * 700;
    ctx.strokeStyle = 'rgba(255,220,130,0.5)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(z.x + (1 - q) * 200, y - 140); ctx.lineTo(z.x, y); ctx.stroke();
    A.glow(ctx, z.x, y, 70, '#ffd56a', 0.9);
    upright(z.x, y); ctx.fillStyle = '#fff8e0'; A.star(ctx, 0, 0, 18, 8, 5); ctx.fill(); ctx.restore();
  }
  if (z.kind === 'zone' && z.vis === 'rain') {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * z.r;
      fx.push({ k: 'drop', x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d, t: 0, life: 0.25 });
    }
  }
}

function drawFx(dt) {
  for (const e of fx) {
    e.t += dt;
    const q = e.t / e.life;
    if (q >= 1) continue;
    switch (e.k) {
      case 'p':
        e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.9; e.vy *= 0.9;
        ctx.globalAlpha = 1 - q; ctx.fillStyle = e.color;
        ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
        break;
      case 'ring':
        ctx.globalAlpha = 1 - q; ctx.strokeStyle = e.color; ctx.lineWidth = e.width * (1 - q * 0.5);
        A.circle(ctx, e.x, e.y, e.r0 + (e.r1 - e.r0) * (1 - (1 - q) * (1 - q))); ctx.stroke();
        break;
      case 'rise': {
        upright(e.x, e.y - q * 90);
        ctx.globalAlpha = (1 - q) * 0.9; ctx.fillStyle = e.color;
        ctx.fillRect(-1.5, -6, 3, 12);
        ctx.restore();
        break;
      }
      case 'cone':
        ctx.globalAlpha = (1 - q) * 0.5; ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.arc(e.x, e.y, e.r * (0.6 + q * 0.4), e.ang - e.angle / 2, e.ang + e.angle / 2); ctx.closePath(); ctx.fill();
        break;
      case 'spin':
        ctx.globalAlpha = 1 - q; ctx.strokeStyle = e.color; ctx.lineWidth = 10 * (1 - q);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, q * 7, q * 7 + 4.2); ctx.stroke();
        break;
      case 'slash': {
        upright(e.x, e.y);
        ctx.globalAlpha = 1 - q; ctx.strokeStyle = e.color; ctx.lineWidth = 7 * (1 - q) + 1;
        ctx.rotate(e.ang);
        ctx.beginPath(); ctx.moveTo(-e.len / 2 * Math.min(1, q * 4), 0); ctx.lineTo(e.len / 2 * Math.min(1, q * 4), 0); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'crack':
        ctx.globalAlpha = 1 - q; ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(e.ang) * e.len * 0.5 + Math.sin(e.ang) * 14, e.y + Math.sin(e.ang) * e.len * 0.5 - Math.cos(e.ang) * 14);
        ctx.lineTo(e.x + Math.cos(e.ang) * e.len, e.y + Math.sin(e.ang) * e.len); ctx.stroke();
        break;
      case 'petal': {
        const r = e.r * (0.2 + q * 0.8);
        ctx.globalAlpha = 1 - q; ctx.fillStyle = q < 0.5 ? '#f7a6c1' : '#b6ffc8';
        A.ellipse(ctx, e.x + Math.cos(e.a + q) * r, e.y + Math.sin(e.a + q) * r, 7, 4, e.a); ctx.fill();
        break;
      }
      case 'drop': {
        upright(e.x, e.y);
        ctx.globalAlpha = 1 - q; ctx.strokeStyle = '#e8fff0'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-14 * (1 - q), -120 * (1 - q) - 20); ctx.lineTo(-14 * (1 - q) + 6, -120 * (1 - q)); ctx.stroke();
        ctx.restore();
        break;
      }
      default: break;
    }
  }
  ctx.globalAlpha = 1;
  fx = fx.filter(e => e.t < e.life);
}

function drawAim(h, aim) {
  const sk = h.def.skill[aim.key];
  if (!sk) return;
  const ang = Math.atan2(aim.y - h.y, aim.x - h.x);
  const want = Math.hypot(aim.x - h.x, aim.y - h.y);
  ctx.save();
  ctx.fillStyle = 'rgba(160,220,255,0.16)';
  ctx.strokeStyle = 'rgba(190,235,255,0.85)';
  ctx.lineWidth = 3;
  const rangeRing = r => { ctx.setLineDash([12, 10]); A.circle(ctx, h.x, h.y, r); ctx.stroke(); ctx.setLineDash([]); };
  if (sk.type === 'line') {
    ctx.translate(h.x, h.y); ctx.rotate(ang);
    ctx.fillRect(0, -sk.width / 2, sk.range, sk.width); ctx.strokeRect(0, -sk.width / 2, sk.range, sk.width);
  } else if (sk.type === 'circle' || (sk.type === 'zone' && !sk.follow)) {
    rangeRing(sk.range);
    const d = Math.min(want, sk.range);
    A.circle(ctx, h.x + Math.cos(ang) * d, h.y + Math.sin(ang) * d, sk.radius); ctx.fill(); ctx.stroke();
  } else if (sk.type === 'cone') {
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.arc(h.x, h.y, sk.range, ang - sk.angle / 2, ang + sk.angle / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (sk.type === 'dash' || sk.type === 'leap' || sk.type === 'blink') {
    rangeRing(sk.range);
    const d = sk.type === 'dash' ? sk.range : Math.min(sk.range, Math.max(sk.type === 'leap' ? 120 : 150, want));
    const ex = h.x + Math.cos(ang) * d, ey = h.y + Math.sin(ang) * d;
    ctx.lineWidth = sk.type === 'dash' ? (sk.width || 50) : 8; ctx.strokeStyle = 'rgba(160,220,255,0.35)';
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(190,235,255,0.85)';
    if (sk.radius) { A.circle(ctx, ex, ey, sk.radius); ctx.fill(); ctx.stroke(); } else { A.circle(ctx, ex, ey, 26); ctx.stroke(); }
  } else if (sk.type === 'nova' || (sk.type === 'zone' && sk.follow)) {
    A.circle(ctx, h.x, h.y, sk.radius); ctx.fill(); ctx.stroke();
  } else if (sk.type === 'execute') {
    rangeRing(sk.range);
  } else if (sk.type === 'buff') {
    A.circle(ctx, h.x, h.y, 60); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------
function drawMinimap(view) {
  const mw = mini.width, mh = mini.height;
  if (!mw) return;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, mw, mh);
  const s = mw / D.W;
  mctx.setTransform(s, 0, 0, s, 0, 0);
  if (cam.flip) mctx.transform(0, 1, 1, 0, 0, 0);
  mctx.drawImage(miniTerrain, 0, 0, D.W, D.H);
  mctx.fillStyle = 'rgba(6,10,8,0.28)'; mctx.fillRect(0, 0, D.W, D.H);
  const player = view.player;
  for (const st of view.structs) {
    if (st.dead) continue;
    const T = D.TEAMS[st.team];
    const z = st.kind === 'core' ? 150 : 100;
    mctx.fillStyle = '#081008'; mctx.fillRect(st.x - z / 2 - 18, st.y - z / 2 - 18, z + 36, z + 36);
    mctx.fillStyle = T.color; mctx.fillRect(st.x - z / 2, st.y - z / 2, z, z);
  }
  for (const m of view.monsters) {
    if (m.dead) continue;
    mctx.fillStyle = m.boss ? '#ffcf5a' : '#c9a24a';
    mctx.beginPath(); mctx.arc(m.x, m.y, m.boss ? 70 : 42, 0, TAU); mctx.fill();
  }
  for (const m of view.minions) {
    if (m.dead) continue;
    mctx.fillStyle = D.TEAMS[m.team].color;
    mctx.fillRect(m.x - 24, m.y - 24, 48, 48);
  }
  for (const h of view.heroes) {
    if (h.dead) continue;
    mctx.fillStyle = D.TEAMS[h.team].color;
    mctx.beginPath(); mctx.arc(h.x, h.y, 95, 0, TAU); mctx.fill();
    mctx.lineWidth = 26; mctx.strokeStyle = h === player ? '#7be38a' : '#0b120d'; mctx.stroke();
  }
  const vw = cw / scale, vh = ch / scale;
  const ex = cam.flip ? vh : vw, ey = cam.flip ? vw : vh;
  mctx.strokeStyle = 'rgba(255,255,255,0.8)'; mctx.lineWidth = 18;
  mctx.strokeRect(cam.x - ex / 2, cam.y - ey / 2, ex, ey);
}
function minimapToWorld(px, py, w, h) {
  let x = px / w * D.W, y = py / h * D.H;
  if (cam.flip) { const t = x; x = y; y = t; }
  return { x, y };
}

LF.render = {
  init, resize, reset, draw, drawMinimap, follow, snap, screenToWorld, dirToWorld, minimapToWorld,
  addText, shake, cam, get scale() { return scale; },
};
})(window.LF);
