// Lanefall: multiplayer. A host runs the simulation and publishes compact snapshots through
// presence; clients publish only their inputs. Three transports share one small interface:
//   - claude.ai `room` capability (when the page runs as a published artifact)
//   - WebSocket relay (when served by server.js)
//   - BroadcastChannel (other tabs on the same device; handy for testing)
'use strict';
(function (LF) {
const D = LF.data;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rid = n => Array.from({ length: n }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[(Math.random() * 32) | 0]).join('');

// ---------------------------------------------------------------------------
// Transports. A "room" here: presence(patch), peers(), onPeers(fn), self(), leave()
// Peers: { peer, presence, isMe }
// ---------------------------------------------------------------------------
function wrapClaudeRoom(r) {
  return {
    presence: p => r.presence(p).catch(e => console.warn('presence', e && e.code)),
    peers: () => r.peers().filter(p => p.kind !== 'agent'),
    onPeers: fn => r.onPeers(() => fn()),
    self: () => { const me = r.peers().find(p => p.sameTab); return me ? me.peer : null; },
    connected: () => r.connected(),
    leave: () => (r.leave ? r.leave().catch(() => {}) : null),
  };
}

const localMe = rid(12); // one peer id per page, shared by every room (as on claude.ai)
function localRoom(name) {
  const ch = new BroadcastChannel('lanefall:' + name);
  const me = localMe;
  let mine = {};
  const others = new Map();
  const listeners = new Set();
  let snap = [];
  let pending = false, sendTimer = 0;
  const rebuild = () => {
    snap = [{ peer: me, presence: mine, isMe: true }].concat([...others].map(([peer, o]) => ({ peer, presence: o.presence, isMe: false })));
    if (!pending) { pending = true; setTimeout(() => { pending = false; listeners.forEach(f => f()); }, 0); }
  };
  const send = () => { sendTimer = 0; ch.postMessage({ t: 'p', peer: me, presence: mine }); };
  ch.onmessage = e => {
    const m = e.data;
    if (!m || m.peer === me) return;
    if (m.t === 'p') { others.set(m.peer, { presence: m.presence, seen: Date.now() }); rebuild(); }
    else if (m.t === 'bye') { others.delete(m.peer); rebuild(); }
    else if (m.t === 'hello') send();
  };
  const hb = setInterval(() => {
    send();
    const cut = Date.now() - 3500;
    let changed = false;
    for (const [p, o] of others) if (o.seen < cut) { others.delete(p); changed = true; }
    if (changed) rebuild();
  }, 1000);
  ch.postMessage({ t: 'hello', peer: me });
  rebuild();
  return {
    presence: patch => {
      mine = Object.assign({}, mine);
      for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
      rebuild();
      if (!sendTimer) sendTimer = setTimeout(send, 30);
      return Promise.resolve();
    },
    peers: () => snap,
    onPeers: fn => { listeners.add(fn); setTimeout(fn, 0); return () => listeners.delete(fn); },
    self: () => me,
    connected: () => true,
    leave: () => { clearInterval(hb); ch.postMessage({ t: 'bye', peer: me }); ch.close(); listeners.clear(); },
  };
}

function wsTransport(url) {
  return new Promise(resolve => {
    let ws;
    try { ws = new WebSocket(url); } catch (e) { resolve(null); return; }
    const rooms = new Map();
    let me = null;
    const timer = setTimeout(() => { try { ws.close(); } catch (e) { /* ignore */ } resolve(null); }, 2000);
    const makeRoom = name => {
      const st = { mine: {}, others: new Map(), listeners: new Set(), snap: [], timer: 0 };
      const rebuild = () => {
        st.snap = [{ peer: me, presence: st.mine, isMe: true }].concat([...st.others].map(([peer, presence]) => ({ peer, presence, isMe: false })));
        st.listeners.forEach(f => f());
      };
      st.rebuild = rebuild;
      const api = {
        presence: patch => {
          st.mine = Object.assign({}, st.mine);
          for (const k in patch) { if (patch[k] === null) delete st.mine[k]; else st.mine[k] = patch[k]; }
          rebuild();
          if (!st.timer) st.timer = setTimeout(() => { st.timer = 0; if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'p', room: name, presence: st.mine })); }, 30);
          return Promise.resolve();
        },
        peers: () => st.snap,
        onPeers: fn => { st.listeners.add(fn); setTimeout(fn, 0); return () => st.listeners.delete(fn); },
        self: () => me,
        connected: () => ws.readyState === 1,
        leave: () => { rooms.delete(name); if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'leave', room: name })); st.listeners.clear(); },
      };
      st.api = api;
      rooms.set(name, st);
      ws.send(JSON.stringify({ t: 'join', room: name }));
      rebuild();
      return api;
    };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === 'welcome') {
        me = m.id; clearTimeout(timer);
        resolve({ kind: 'server', label: 'Online server', lobby: makeRoom('lobby'), join: name => Promise.resolve(rooms.has(name) ? rooms.get(name).api : makeRoom(name)) });
        return;
      }
      const st = rooms.get(m.room);
      if (!st) return;
      if (m.t === 'peers') { st.others = new Map(m.peers.filter(p => p.peer !== me).map(p => [p.peer, p.presence])); st.rebuild(); }
      else if (m.t === 'p') { if (m.peer !== me) { st.others.set(m.peer, m.presence); st.rebuild(); } }
      else if (m.t === 'left') { st.others.delete(m.peer); st.rebuild(); }
    };
    ws.onerror = () => { clearTimeout(timer); resolve(null); };
  });
}

let transportPromise = null;
function connect() {
  if (transportPromise) return transportPromise;
  transportPromise = (async () => {
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const room = await window.claude.use('room');
        if (room) {
          const lobby = wrapClaudeRoom(room);
          return { kind: 'claude', label: 'Online', lobby, join: async name => wrapClaudeRoom(await room.join(name)) };
        }
      } catch (e) { /* fall through */ }
    }
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
      const t = location.hostname === 'claude.ai' || location.hostname.endsWith('.claude.ai') || location.hostname.endsWith('claudeusercontent.com') ? null : await wsTransport(url);
      if (t) return t;
    }
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const lobby = localRoom('lobby');
        return { kind: 'local', label: 'This device only', lobby, join: name => Promise.resolve(localRoom(name)) };
      } catch (e) { /* blocked */ }
    }
    return null;
  })();
  return transportPromise;
}

// ---------------------------------------------------------------------------
// Snapshot encoding
// ---------------------------------------------------------------------------
const VIS = ['', 'arrow', 'bigarrow', 'bullet', 'snipe', 'light', 'bolt', 'hex', 'hexorb', 'petal', 'snare', 'spear', 'tower', 'cannon', 'minion',
  'cleave', 'slam', 'pounce', 'knives', 'roar', 'bloom', 'shot', 'claw', 'field', 'star', 'quake', 'buff', 'blink', 'execute', 'impact',
  'rain', 'whirl', 'rift', 'sanctuary'];
const VIS_I = Object.fromEntries(VIS.map((v, i) => [v, i]));
const MT = ['melee', 'caster', 'siege'];
const MONS = Object.keys(D.MONSTERS);
const KEYS = ['', 's1', 's2', 'ult'];
const TAGS = ['', 'First Blood', 'Double Kill', 'Triple Kill', 'Mega Kill', 'Wipe Out', 'Shutdown', 'Killing Spree', 'Unstoppable', 'Legendary'];
const EV = ['', 'kill', 'tower', 'monster', 'fx', 'level', 'gold', 'cast', 'recalled', 'respawn', 'buy', 'ace', 'gameover', 'spawn', 'recall', 'heal', 'sell'];
const EV_I = Object.fromEntries(EV.map((v, i) => [v, i]));

const pctOf = u => clamp(Math.round(u.hp / u.maxHp * 100), 0, 100);
const fac8 = a => Math.round((((a / TAU) % 1) + 1) % 1 * 8) % 8;

function packMinion(u) {
  const x = clamp(u.x >> 2, 0, 1023), y = clamp(u.y >> 2, 0, 1023);
  const code = u.team * 3 + MT.indexOf(u.mtype);
  let n = u.id % 4096;
  n = n * 1024 + x; n = n * 1024 + y; n = n * 128 + (u.dead ? 0 : Math.max(1, pctOf(u)));
  n = n * 8 + code; n = n * 8 + fac8(u.facing); n = n * 4 + (u.atkN % 4); n = n * 2 + (u.stunT > 0 ? 1 : 0);
  return n;
}
function unpackMinion(n) {
  const st = n % 2; n = Math.floor(n / 2);
  const atk = n % 4; n = Math.floor(n / 4);
  const f = n % 8; n = Math.floor(n / 8);
  const code = n % 8; n = Math.floor(n / 8);
  const hp = n % 128; n = Math.floor(n / 128);
  const y = (n % 1024) * 4 + 2; n = Math.floor(n / 1024);
  const x = (n % 1024) * 4 + 2; n = Math.floor(n / 1024);
  return { id: n, x, y, hp, team: Math.floor(code / 3), mtype: MT[code % 3], facing: f / 8 * TAU, atk, stun: st };
}
function packMonster(u) {
  let n = clamp(u.x >> 2, 0, 1023);
  n = n * 1024 + clamp(u.y >> 2, 0, 1023);
  n = n * 128 + (u.dead ? 0 : Math.max(1, pctOf(u)));
  n = n * 2 + (u.dead ? 1 : 0); n = n * 4 + (u.atkN % 4); n = n * 8 + fac8(u.facing); n = n * 2 + (u.stunT > 0 ? 1 : 0);
  return n;
}
function unpackMonster(n) {
  const st = n % 2; n = Math.floor(n / 2);
  const f = n % 8; n = Math.floor(n / 8);
  const atk = n % 4; n = Math.floor(n / 4);
  const dead = n % 2; n = Math.floor(n / 2);
  const hp = n % 128; n = Math.floor(n / 128);
  const y = (n % 1024) * 4 + 2; n = Math.floor(n / 1024);
  return { x: n * 4 + 2, y, hp, dead, atk, facing: f / 8 * TAU, stun: st };
}
function packProj(p) {
  let n = p.id % 4096;
  n = n * 1024 + clamp(p.x >> 2, 0, 1023); n = n * 1024 + clamp(p.y >> 2, 0, 1023);
  n = n * 64 + (VIS_I[p.vis] || 0);
  n = n * 64 + Math.round((((p.ang || 0) / TAU) % 1 + 1) % 1 * 64) % 64;
  n = n * 4 + p.team; n = n * 2 + (p.big ? 1 : 0);
  return n;
}
function unpackProj(n) {
  const big = n % 2; n = Math.floor(n / 2);
  const team = n % 4; n = Math.floor(n / 4);
  const ang = (n % 64) / 64 * TAU; n = Math.floor(n / 64);
  const vis = VIS[n % 64]; n = Math.floor(n / 64);
  const y = (n % 1024) * 4 + 2; n = Math.floor(n / 1024);
  const x = (n % 1024) * 4 + 2; n = Math.floor(n / 1024);
  return { id: n, x, y, vis, ang, team, big: !!big };
}
function packItems(items) { let n = 0; for (let i = 0; i < 6; i++) n = n * 16 + (items[i] ? D.ITEM_INDEX[items[i]] + 1 : 0); return n; }
function unpackItems(n) { const out = []; for (let i = 5; i >= 0; i--) { const v = n % 16; n = Math.floor(n / 16); if (v) out[i] = D.ITEMS[v - 1].id; } return out.filter(Boolean); }

function heroBits(u) {
  let b = 0;
  if (u.dead) b |= 1; if (u.stunT > 0) b |= 2; if (u.rootT > 0) b |= 4; if (u.slowT > 0) b |= 8;
  for (const x of u.buffs) { if (x.id === 'azure') b |= 16; if (x.id === 'ember') b |= 32; }
  if (u.leap || u.dash) b |= 64;
  if (u.hidden && u.hidden[0]) b |= 128;
  if (u.hidden && u.hidden[1]) b |= 256;
  return b;
}

function encodeEvent(e) {
  const i = EV_I[e.type];
  if (!i) return null;
  const q = v => Math.round(v || 0);
  switch (e.type) {
    case 'kill': return [e.seq, i, e.killer, e.victim, e.team, Math.max(0, TAGS.indexOf(e.tag)), q(e.x), q(e.y)];
    case 'tower': return [e.seq, i, e.idx, e.team, e.kind === 'core' ? 1 : 0, q(e.x), q(e.y)];
    case 'monster': return [e.seq, i, MONS.indexOf(e.mtype), e.team, e.seat, e.boss ? 1 : 0];
    case 'fx': return [e.seq, i, VIS_I[e.vis] || 0, q(e.x), q(e.y), q(e.r), e.team ?? 2, q((e.ang || 0) * 100), q((e.angle || 0) * 100), q(e.x2), q(e.y2), e.seat ?? -1];
    case 'level': return [e.seq, i, e.seat, e.level];
    case 'gold': return [e.seq, i, e.seat, q(e.amt), q(e.x), q(e.y)];
    case 'cast': return [e.seq, i, e.seat, KEYS.indexOf(e.key)];
    case 'recalled': case 'respawn': case 'recall': return [e.seq, i, e.seat];
    case 'buy': case 'sell': return [e.seq, i, e.seat, D.ITEM_INDEX[e.item]];
    case 'ace': return [e.seq, i, e.team];
    case 'gameover': return [e.seq, i, e.winner];
    case 'spawn': return [e.seq, i, MONS.indexOf(e.mtype)];
    case 'heal': return [e.seq, i, e.seat, q(e.amt)];
    default: return null;
  }
}
function decodeEvent(a) {
  const type = EV[a[1]], seq = a[0];
  switch (type) {
    case 'kill': return { seq, type, killer: a[2], victim: a[3], team: a[4], tag: TAGS[a[5]], x: a[6], y: a[7] };
    case 'tower': return { seq, type, idx: a[2], team: a[3], kind: a[4] ? 'core' : 'tower', x: a[5], y: a[6] };
    case 'monster': return { seq, type, mtype: MONS[a[2]], team: a[3], seat: a[4], boss: !!a[5] };
    case 'fx': return { seq, type, vis: VIS[a[2]], x: a[3], y: a[4], r: a[5], team: a[6], ang: a[7] / 100, angle: a[8] / 100, x2: a[9], y2: a[10], seat: a[11] };
    case 'level': return { seq, type, seat: a[2], level: a[3] };
    case 'gold': return { seq, type, seat: a[2], amt: a[3], x: a[4], y: a[5] };
    case 'cast': return { seq, type, seat: a[2], key: KEYS[a[3]] };
    case 'recalled': case 'respawn': case 'recall': return { seq, type, seat: a[2] };
    case 'buy': case 'sell': return { seq, type, seat: a[2], item: D.ITEMS[a[3]].id };
    case 'ace': return { seq, type, team: a[2] };
    case 'gameover': return { seq, type, winner: a[2] };
    case 'spawn': return { seq, type, mtype: MONS[a[2]] };
    case 'heal': return { seq, type, seat: a[2], amt: a[3] };
    default: return null;
  }
}

function encodeMain(G, seq, withStats) {
  const r = Math.round;
  const g = {
    s: seq, t: r(G.t * 10), k: G.kills, o: G.over ? G.winner : -1,
    h: G.heroes.map(u => [r(u.x), r(u.y), r(Math.max(0, u.hp)), r(u.mana), r((((u.facing % TAU) + TAU) % TAU) * 10), u.level, heroBits(u),
      u.dead ? Math.ceil(u.respawn) : 0, u.atkN % 100, u.castN % 100, KEYS.indexOf(u.castKey), r(u.shield), r(u.air), u.recall ? r(u.recall.t * 10) : -1,
      r(u.cds.s1 * 10), r(u.cds.s2 * 10), r(u.cds.ult * 10)]),
    b: G.structs.map(s => pctOf(s) * 16 + (s.target && s.target.kind === 'hero' ? s.target.seat + 1 : 0)),
    z: G.zones.slice(0, 10).map(z => [r(z.x), r(z.y), r(z.r), VIS_I[z.vis] || 0, z.team, r(z.t * 10), r((z.kind === 'circle' ? z.delay : z.dur) * 10), z.kind === 'circle' ? 0 : 1]),
    e: G.events.slice(-12).map(encodeEvent).filter(Boolean),
  };
  if (withStats) {
    g.st = G.heroes.map(u => [r(u.maxHp), r(u.maxMana), u.k, u.d, u.a, Math.floor(u.gold), u.cs, Math.floor(u.xp), packItems(u.items), r(u.goldTotal), r(u.ad), r(u.ap), r(u.armor), r(u.ms), Math.round(u.as * 100)]);
  }
  return g;
}
function encodeWorld(G, seq) {
  const minions = G.units.filter(u => u.kind === 'minion');
  return {
    s: seq,
    m: minions.slice(0, 110).map(packMinion),
    j: G.monsters.map(packMonster),
    p: G.projs.slice(0, 40).map(packProj),
  };
}

// ---------------------------------------------------------------------------
// Client-side mirror: rebuilds a view of the game from snapshots.
// ---------------------------------------------------------------------------
function createMirror(slots, mySeat) {
  const V = {
    t: 0, heroes: [], minions: [], monsters: [], structs: [], projs: [], zones: [], events: [], kills: [0, 0],
    over: false, winner: -1, player: null, mirror: true, lastMain: 0, lastWorld: 0, minionMap: new Map(), projMap: new Map(),
  };
  slots.forEach((s, seat) => {
    const def = D.HERO[D.HEROES[s.h].id];
    V.heroes.push({
      kind: 'hero', id: 1000 + seat, seat, team: seat < 5 ? 0 : 1, role: seat % 5, def, name: s.n || def.name, human: !!s.p,
      x: D.FOUNTAIN[seat < 5 ? 0 : 1].x, y: D.FOUNTAIN[seat < 5 ? 0 : 1].y, tx: 0, ty: 0, r: 26,
      hp: def.stats.hp, maxHp: def.stats.hp, mana: def.stats.mana, maxMana: def.stats.mana, level: 1, facing: 0,
      atkN: 0, castN: 0, castKey: '', dead: false, respawn: 0, shield: 0, air: 0, recall: null, stunT: 0, rootT: 0, slowT: 0,
      cds: { s1: 0, s2: 0, ult: 0 }, k: 0, d: 0, a: 0, gold: 0, cs: 0, xp: 0, items: [], flags: 0, goldTotal: 0,
      ad: def.stats.ad, ap: 0, armor: def.stats.armor, ms: def.stats.ms, as: def.stats.as, init: false,
    });
  });
  V.player = mySeat >= 0 ? V.heroes[mySeat] : null;
  for (const team of [0, 1]) {
    D.STRUCTS[team].forEach((s, i) => {
      const st = D.STRUCT_STATS[s.tier];
      V.structs.push({ kind: s.type, id: 3000 + team * 7 + i, team, idx: team * 7 + i, x: s.x, y: s.y, r: st.r, hp: st.hp, maxHp: st.hp, range: st.range, tier: s.tier, lane: s.lane, dead: false, target: null, targetSeat: -1, guarded: false });
    });
  }
  D.CAMPS.forEach((c, i) => {
    const def = D.MONSTERS[c.type];
    V.monsters.push({ kind: 'monster', id: 2000 + i, mtype: c.type, team: 2, x: c.x, y: c.y, tx: c.x, ty: c.y, r: def.r, hp: def.hp, maxHp: def.hp, dead: true, boss: !!def.boss, atkN: 0, facing: 0 });
  });
  return V;
}

function applyMain(V, g) {
  if (!g || g.s <= V.lastMain) return;
  V.lastMain = g.s;
  V.t = g.t / 10;
  V.kills = g.k;
  if (g.o >= 0 && !V.over) { V.over = true; V.winner = g.o; }
  g.h.forEach((a, seat) => {
    const h = V.heroes[seat];
    if (!h) return;
    const bits = a[6];
    if (!h.init) { h.x = a[0]; h.y = a[1]; h.init = true; }
    h.tx = a[0]; h.ty = a[1];
    if ((bits & 1) === 0 && h.dead) { h.x = a[0]; h.y = a[1]; }
    if (bits & 64 && Math.hypot(h.x - a[0], h.y - a[1]) > 300) { h.x = a[0]; h.y = a[1]; }
    h.hp = a[2]; h.mana = a[3]; h.facing = a[4] / 10; h.level = a[5];
    h.dead = !!(bits & 1); h.stunT = bits & 2 ? 1 : 0; h.rootT = bits & 4 ? 1 : 0; h.slowT = bits & 8 ? 1 : 0;
    h.flags = (bits & 16 ? 1 : 0) | (bits & 32 ? 2 : 0);
    h.hidden = [!!(bits & 128), !!(bits & 256)];
    h.respawn = a[7]; h.atkN = a[8]; h.castN = a[9]; h.castKey = KEYS[a[10]]; h.shield = a[11]; h.air = a[12];
    h.recall = a[13] >= 0 ? { t: a[13] / 10 } : null;
    h.cds = { s1: a[14] / 10, s2: a[15] / 10, ult: a[16] / 10 };
  });
  g.b.forEach((v, i) => {
    const s = V.structs[i];
    const pct = Math.floor(v / 16), tgt = (v % 16) - 1;
    s.hp = s.maxHp * pct / 100;
    if (pct <= 0) s.hp = 0;
    s.dead = pct <= 0;
    s.targetSeat = tgt;
    s.target = tgt >= 0 ? V.heroes[tgt] : null;
  });
  // Guard state, mirrored from the sim rules.
  for (const team of [0, 1]) {
    const L = V.structs.slice(team * 7, team * 7 + 7);
    for (let i = 0; i < 3; i++) L[i * 2 + 1].guarded = !L[i * 2].dead && !L[i * 2 + 1].dead;
    L[6].guarded = !L[6].dead && !(L[1].dead || L[3].dead || L[5].dead);
    for (let i = 0; i < 3; i++) L[i * 2].guarded = false;
  }
  V.zones = g.z.map(a => ({ x: a[0], y: a[1], r: a[2], vis: VIS[a[3]], team: a[4], t: a[5] / 10, kind: a[7] ? 'zone' : 'circle', delay: a[6] / 10, dur: a[6] / 10 }));
  for (const a of g.e) {
    if (V.events.length && a[0] <= V.events[V.events.length - 1].seq) continue;
    const e = decodeEvent(a);
    if (e) V.events.push(e);
  }
  if (V.events.length > 60) V.events.splice(0, V.events.length - 60);
  if (g.st) {
    g.st.forEach((a, seat) => {
      const h = V.heroes[seat];
      h.maxHp = a[0]; h.maxMana = a[1]; h.k = a[2]; h.d = a[3]; h.a = a[4]; h.gold = a[5]; h.cs = a[6]; h.xp = a[7];
      h.items = unpackItems(a[8]); h.goldTotal = a[9]; h.ad = a[10]; h.ap = a[11]; h.armor = a[12]; h.ms = a[13]; h.as = a[14] / 100;
    });
  }
}

function applyWorld(V, w) {
  if (!w || w.s <= V.lastWorld) return;
  V.lastWorld = w.s;
  const seen = new Set();
  for (const n of w.m) {
    const d = unpackMinion(n);
    seen.add(d.id);
    let m = V.minionMap.get(d.id);
    if (!m) {
      const st = D.MINION[d.mtype];
      m = { kind: 'minion', id: d.id, mtype: d.mtype, team: d.team, x: d.x, y: d.y, r: st.r, maxHp: 100, hp: d.hp, atkN: d.atk, facing: d.facing, dead: false };
      V.minionMap.set(d.id, m);
    }
    m.tx = d.x; m.ty = d.y; m.hp = d.hp; m.facing = d.facing; m.atkN = d.atk; m.stunT = d.stun;
    m.dead = d.hp === 0;
  }
  for (const [id, m] of V.minionMap) {
    if (!seen.has(id)) {
      if (!m.dead) { m.dead = true; m.hp = 0; }
      m.gone = (m.gone || 0) + 1;
      if (m.gone > 12) V.minionMap.delete(id);
    }
  }
  V.minions = [...V.minionMap.values()];
  w.j.forEach((n, i) => {
    const d = unpackMonster(n), m = V.monsters[i];
    if (m.dead && !d.dead) { m.x = d.x; m.y = d.y; }
    m.tx = d.x; m.ty = d.y; m.hp = m.maxHp * d.hp / 100; m.dead = !!d.dead; m.atkN = d.atk; m.facing = d.facing; m.stunT = d.stun;
  });
  const pseen = new Set();
  for (const n of w.p) {
    const d = unpackProj(n);
    pseen.add(d.id);
    let p = V.projMap.get(d.id);
    if (!p) { p = Object.assign({}, d); V.projMap.set(d.id, p); }
    p.tx = d.x; p.ty = d.y; p.ang = d.ang;
  }
  for (const id of [...V.projMap.keys()]) if (!pseen.has(id)) V.projMap.delete(id);
  V.projs = [...V.projMap.values()];
}

// Smooth positions toward the latest snapshot every frame.
function smooth(V, dt) {
  const k = Math.min(1, dt * 12);
  for (const h of V.heroes) {
    if (!h.init) continue;
    if (Math.hypot(h.tx - h.x, h.ty - h.y) > 500) { h.x = h.tx; h.y = h.ty; }
    h.x += (h.tx - h.x) * k; h.y += (h.ty - h.y) * k;
    for (const key of ['s1', 's2', 'ult']) h.cds[key] = Math.max(0, h.cds[key] - dt);
    if (h.dead) h.respawn = Math.max(0, h.respawn - dt);
    if (h.recall) h.recall.t += dt;
  }
  for (const m of V.minions) if (m.tx !== undefined) { m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k; }
  for (const m of V.monsters) { m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k; }
  const kp = Math.min(1, dt * 20);
  for (const p of V.projs) { p.x += (p.tx - p.x) * kp; p.y += (p.ty - p.y) * kp; }
  for (const z of V.zones) z.t += dt;
}

// ---------------------------------------------------------------------------
// Inputs (client -> host)
// ---------------------------------------------------------------------------
function targetRef(u) {
  if (!u) return 0;
  if (u.kind === 'hero') return -1 - u.seat;
  if (u.kind === 'tower' || u.kind === 'core') return 10000 + u.idx;
  if (u.kind === 'monster') return 20000 + (u.idx !== undefined ? u.idx : u.id - 2000);
  return 1 + (u.id % 4096);
}
function resolveTarget(G, ref) {
  if (!ref) return null;
  if (ref < 0) return G.heroes[-1 - ref] || null;
  if (ref >= 20000) return G.monsters[ref - 20000] || null;
  if (ref >= 10000) return G.structs[ref - 10000] || null;
  const id = ref - 1;
  return G.units.find(u => u.kind === 'minion' && u.id % 4096 === id) || null;
}

// ---------------------------------------------------------------------------
// Party: one lobby / match over a named room (plus a second room for world data).
// ---------------------------------------------------------------------------
const CODE_RE = /^[a-z0-9]{4,8}$/;
const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16) || 'Player';
const cleanChat = s => String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '').trim().slice(0, 120);

class Party {
  constructor(transport, code, isHost, nick) {
    this.tr = transport; this.code = code; this.isHost = isHost; this.nick = cleanName(nick);
    this.room = null; this.world = null; this.me = null;
    this.L = { name: '', ph: 'lobby', slots: new Array(10).fill(0), diff: 'normal', v: 1 };
    this.chat = []; this.chatSeen = new Map(); this.chatN = 0;
    this.want = -1; this.hero = -1;
    this.onChange = null; this.onStart = null; this.onEnd = null; this.onGone = null; this.onSnapshot = null;
    this.hostPeer = null; this.hostSeenAt = Date.now();
    this.seq = 0; this.mirror = null; this.lastInp = ''; this.inpSeq = { c: 0, m: 0, t: 0, r: 0 };
    this.castLog = []; this.closed = false;
    this.remoteState = new Map(); // seat -> last processed input seqs (host)
  }
  async open(lobbyName) {
    this.room = await this.tr.join('lf-' + this.code);
    this.world = await this.tr.join('lf-' + this.code + '-w');
    for (let i = 0; i < 40 && !this.room.self(); i++) await new Promise(r => setTimeout(r, 50));
    this.me = this.room.self();
    if (this.isHost) {
      this.L.name = cleanName(lobbyName || this.nick + "'s lobby").slice(0, 24);
      this.L.slots[0] = { p: this.me, h: firstHeroFor(0), n: this.nick };
      this.pushLobby();
    } else {
      this.room.presence({ v: 1, role: 'player', nm: this.nick });
    }
    this.unsub = this.room.onPeers(() => this.onPeers());
    this.unsubW = this.world.onPeers(() => this.onWorld());
    this.tick = setInterval(() => this.housekeeping(), 500);
    return this;
  }
  peers() { return this.room ? this.room.peers() : []; }
  hostPresence() {
    const ps = this.peers();
    if (this.hostPeer) { const p = ps.find(x => x.peer === this.hostPeer); if (p && p.presence.role === 'host') return p.presence; }
    const h = ps.find(x => x.presence && x.presence.role === 'host' && !x.isMe);
    if (h) { this.hostPeer = h.peer; return h.presence; }
    return null;
  }
  onPeers() {
    if (this.closed) return;
    if (this.isHost) { this.reconcile(); }
    else {
      const hp = this.hostPresence();
      if (hp) {
        this.hostSeenAt = Date.now();
        const L = hp.L;
        if (L && typeof L === 'object') {
          const prevPh = this.L.ph;
          this.L = L;
          if (L.ph === 'game' && prevPh !== 'game' && this.onStart) this.onStart();
          if (L.ph === 'lobby' && prevPh !== 'lobby' && this.onChange) this.onChange();
          if (this.mirror && hp.g) { applyMain(this.mirror, hp.g); if (this.onSnapshot) this.onSnapshot(); }
        }
      }
    }
    this.collectChat();
    if (this.onChange) this.onChange();
  }
  onWorld() {
    if (this.isHost || !this.mirror || this.closed) return;
    const p = this.world.peers().find(x => x.peer === this.hostPeer);
    if (p && p.presence.w) applyWorld(this.mirror, p.presence.w);
  }
  collectChat() {
    for (const p of this.peers()) {
      const c = p.presence && p.presence.chat;
      if (!c || typeof c !== 'object') continue;
      const last = this.chatSeen.get(p.peer) || 0;
      if (typeof c.i !== 'number' || c.i <= last) continue;
      this.chatSeen.set(p.peer, c.i);
      this.chat.push({ who: cleanName(p.presence.nm), me: p.isMe, text: cleanChat(c.m) });
      if (this.chat.length > 40) this.chat.shift();
    }
  }
  say(text) {
    const m = cleanChat(text);
    if (!m) return;
    this.chatN++;
    this.room.presence({ chat: { i: this.chatN, m } });
  }
  housekeeping() {
    if (this.closed) return;
    if (this.isHost) { this.reconcile(); this.advertise(); }
    else if (Date.now() - this.hostSeenAt > 8000 && this.onGone) { const f = this.onGone; this.onGone = null; f(); }
  }
  // ----- host -----
  pushLobby() { this.room.presence({ v: 1, role: 'host', nm: this.nick, L: this.L }); this.advertise(); if (this.onChange) this.onChange(); }
  advertise() {
    const humans = this.L.slots.filter(s => s && s.p).length;
    this.tr.lobby.presence({ v: 1, nm: this.nick, lb: { c: this.code, n: this.L.name, p: humans, s: this.L.ph === 'lobby' ? 'open' : 'playing' } });
  }
  reconcile() {
    if (!this.isHost) return;
    const ps = this.peers();
    const live = new Set(ps.map(p => p.peer));
    let changed = false;
    const slots = this.L.slots.slice();
    slots.forEach((s, i) => { if (s && s.p && s.p !== this.me && !live.has(s.p)) { slots[i] = 0; changed = true; if (this.onLeft) this.onLeft(i); } });
    if (this.L.ph === 'lobby') {
      const free = i => i >= 0 && i < 10 && (!slots[i] || !slots[i].p);
      for (const p of ps) {
        if (p.isMe) continue;
        const pr = p.presence || {};
        if (pr.role !== 'player') continue;
        let cur = slots.findIndex(s => s && s.p === p.peer);
        const want = Number.isInteger(pr.want) ? pr.want : -1;
        if (cur < 0) {
          const seat = free(want) ? want : slots.findIndex((s, i) => free(i));
          if (seat < 0) continue;
          slots[seat] = { p: p.peer, h: firstHeroFor(seat % 5), n: cleanName(pr.nm) };
          cur = seat; changed = true;
        } else if (want !== cur && free(want)) {
          slots[want] = slots[cur]; slots[cur] = 0; cur = want; changed = true;
        }
        const s = slots[cur];
        const hero = Number.isInteger(pr.hero) && pr.hero >= 0 && pr.hero < D.HEROES.length ? pr.hero : s.h;
        const nm = cleanName(pr.nm);
        if (s.h !== hero || s.n !== nm) { slots[cur] = { p: s.p, h: hero, n: nm }; changed = true; }
      }
    }
    if (changed) { this.L = Object.assign({}, this.L, { slots }); this.pushLobby(); }
  }
  hostMove(seat) {
    if (!this.isHost || this.L.ph !== 'lobby') return;
    const slots = this.L.slots.slice();
    const cur = slots.findIndex(s => s && s.p === this.me);
    if (seat === cur || (slots[seat] && slots[seat].p)) return;
    slots[seat] = Object.assign({}, slots[cur], { h: slots[cur].h });
    slots[cur] = 0;
    this.L = Object.assign({}, this.L, { slots });
    this.pushLobby();
  }
  hostPick(hero) {
    const slots = this.L.slots.slice();
    const cur = slots.findIndex(s => s && s.p === this.me);
    if (cur < 0) return;
    slots[cur] = Object.assign({}, slots[cur], { h: hero });
    this.L = Object.assign({}, this.L, { slots });
    this.pushLobby();
  }
  setDiff(d) { this.L = Object.assign({}, this.L, { diff: d }); this.pushLobby(); }
  // Fill empty seats with bots and start. Returns the seat config for the sim.
  start() {
    const slots = this.L.slots.map((s, seat) => {
      if (s && s.p) return s;
      const team = seat < 5 ? 0 : 1;
      const used = this.L.slots.filter((x, i) => x && (i < 5 ? 0 : 1) === team).map(x => x.h);
      const opts = D.HEROES.map((h, i) => i).filter(i => D.HEROES[i].role === D.ROLES[seat % 5].id && !used.includes(i));
      const pick = opts.length ? opts[(Math.random() * opts.length) | 0] : firstHeroFor(seat % 5);
      return { b: 1, h: pick };
    });
    this.L = Object.assign({}, this.L, { slots, ph: 'game', startedAt: Date.now() });
    this.seq = 0;
    this.pushLobby();
    return slots.map((s, seat) => ({
      hero: D.HEROES[s.h].id, human: !!s.p, local: s.p === this.me, peer: s.p || null,
      name: s.p ? s.n : D.HEROES[s.h].name, diff: this.L.diff,
    }));
  }
  publish(G) {
    this.seq++;
    const g = encodeMain(G, this.seq, this.seq % 3 === 1 || G.over);
    this.room.presence({ g });
    this.world.presence({ w: encodeWorld(G, this.seq) });
  }
  endMatch(winner) {
    this.L = Object.assign({}, this.L, { ph: 'end', winner });
    this.pushLobby();
  }
  backToLobby() {
    const slots = this.L.slots.map(s => (s && s.p ? s : 0));
    this.L = Object.assign({}, this.L, { ph: 'lobby', slots });
    this.room.presence({ g: null });
    this.world.presence({ w: null });
    this.pushLobby();
  }
  // Apply remote players' inputs to their heroes.
  applyInputs(G) {
    const byPeer = new Map(this.peers().map(p => [p.peer, p.presence]));
    for (const h of G.heroes) {
      if (!h.human || h.local) continue;
      const pr = byPeer.get(h.peer);
      if (!pr) {
        if (h.human) { h.human = false; h.diff = this.L.diff; h.autoBuy = true; }
        continue;
      }
      const inp = pr.inp;
      if (!inp || typeof inp !== 'object') continue;
      let st = this.remoteState.get(h.seat);
      if (!st) { st = { c: 0, m: 0, t: 0, r: 0, s: 0 }; this.remoteState.set(h.seat, st); }
      const I = h.input;
      I.mv = Array.isArray(inp.mv) ? { x: clamp(+inp.mv[0] / 100 || 0, -1, 1), y: clamp(+inp.mv[1] / 100 || 0, -1, 1) } : null;
      I.attack = !!inp.a;
      if (Array.isArray(inp.mt) && inp.ms > st.m) { st.m = inp.ms; I.moveTo = { x: clamp(+inp.mt[0] || 0, 0, D.W), y: clamp(+inp.mt[1] || 0, 0, D.H) }; }
      if (inp.ts > st.t) { st.t = inp.ts; const t = resolveTarget(G, inp.tg | 0); I.target = t ? t.id : 0; }
      if (inp.r > st.r) { st.r = inp.r; I.recall = true; }
      if (inp.ab !== undefined && !!inp.ab !== h.autoBuy) I.autoBuy = !!inp.ab;
      if (Array.isArray(inp.sh)) {
        for (const o of inp.sh) {
          if (!Array.isArray(o) || !(o[0] > st.s)) continue;
          st.s = o[0];
          const it = D.ITEMS[o[2]];
          if (it) I.shop.push({ op: o[1] === 2 ? 'sell' : 'buy', id: it.id });
        }
      }
      if (Array.isArray(inp.c)) {
        for (const c of inp.c) {
          if (!Array.isArray(c) || !(c[0] > st.c)) continue;
          st.c = c[0];
          const key = KEYS[c[1]];
          if (key) I.casts.push({ key, x: +c[2] || 0, y: +c[3] || 0 });
        }
      }
    }
  }
  // ----- client -----
  pickSlot(seat) { this.want = seat; this.room.presence({ want: seat }); }
  pickHero(hero) { this.hero = hero; if (this.isHost) this.hostPick(hero); else this.room.presence({ hero }); }
  mySeat() { return this.L.slots.findIndex(s => s && s.p === this.me); }
  startMirror() {
    this.mirror = createMirror(this.L.slots, this.mySeat());
    const hp = this.hostPresence();
    if (hp && hp.g) applyMain(this.mirror, hp.g);
    this.onWorld();
    return this.mirror;
  }
  sendInput(inp) {
    const s = JSON.stringify(inp);
    if (s === this.lastInp) return;
    this.lastInp = s;
    this.room.presence({ inp });
  }
  leave() {
    this.closed = true;
    clearInterval(this.tick);
    if (this.unsub) this.unsub();
    if (this.unsubW) this.unsubW();
    if (this.isHost) this.tr.lobby.presence({ lb: null });
    if (this.room) this.room.leave();
    if (this.world) this.world.leave();
  }
}
function firstHeroFor(role) { return D.HEROES.findIndex(h => h.role === D.ROLES[role].id); }

async function hostParty(tr, nick, name) {
  const code = rid(5);
  const p = new Party(tr, code, true, nick);
  return p.open(name);
}
async function joinParty(tr, code, nick) {
  code = String(code || '').toLowerCase().trim();
  if (!CODE_RE.test(code)) throw new Error('bad-code');
  const p = new Party(tr, code, false, nick);
  return p.open();
}

LF.net = {
  connect, hostParty, joinParty, encodeMain, encodeWorld, createMirror, applyMain, applyWorld, smooth,
  targetRef, KEYS, cleanName, CODE_RE,
};
})(window.LF);
