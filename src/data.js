// Lanefall: static game data. Map geometry, roles, heroes, items, monsters.
'use strict';
window.LF = window.LF || {};
(function (LF) {

// The layout below is authored on a 3600 grid and scaled up by MAP.
const MAP = 4 / 3;
const W = 4800, H = 4800;
const S = v => Math.round(v * MAP);
const BLUE = 0, RED = 1, NEUTRAL = 2;
const TAU = Math.PI * 2;

// The map is symmetric across the line y = x: swapping x and y turns any blue
// position into the matching red one. Blue's base is bottom-left.
const mirror = p => ({ x: p.y, y: p.x });

const TEAMS = [
  { name: 'Dawnguard', short: 'Blue', color: '#4aa8ff', deep: '#123a66', light: '#cfe8ff', rgb: '74,168,255' },
  { name: 'Duskborn', short: 'Red', color: '#ff5263', deep: '#5c1520', light: '#ffd3d8', rgb: '255,82,99' },
  { name: 'Wild', short: 'Neutral', color: '#d8b45a', deep: '#4a3a12', light: '#f6e6b4', rgb: '216,180,90' },
];

// ---------------------------------------------------------------------------
// Lanes (listed from the blue base toward the red base)
// ---------------------------------------------------------------------------
function makeLane(id, raw) {
  const pts = raw.map(([x, y]) => ({ x: S(x), y: S(y) }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { id, pts, cum, len: cum[cum.length - 1] };
}
const LANES = {
  top: makeLane('top', [[430, 2860], [330, 2100], [330, 700], [480, 480], [700, 330], [2100, 330], [2860, 430]]),
  mid: makeLane('mid', [[640, 2960], [1800, 1800], [2960, 640]]),
  bot: makeLane('bot', [[740, 3170], [1500, 3270], [2900, 3270], [3120, 3120], [3270, 2900], [3270, 1500], [3170, 740]]),
};
const LANE_IDS = ['top', 'mid', 'bot'];

function laneAt(lane, s) {
  s = Math.max(0, Math.min(lane.len, s));
  let i = 0;
  while (i < lane.pts.length - 2 && lane.cum[i + 1] < s) i++;
  const a = lane.pts[i], b = lane.pts[i + 1];
  const segLen = lane.cum[i + 1] - lane.cum[i] || 1;
  const t = (s - lane.cum[i]) / segLen;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / segLen, dy: (b.y - a.y) / segLen };
}
// Distance along the lane of the closest point to (x, y), and how far away that point is.
function laneProject(lane, x, y) {
  let best = { s: 0, d: Infinity };
  for (let i = 0; i < lane.pts.length - 1; i++) {
    const a = lane.pts[i], b = lane.pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
    let t = ((x - a.x) * vx + (y - a.y) * vy) / L2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + vx * t, py = a.y + vy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { s: lane.cum[i] + t * Math.sqrt(L2), d };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Bases, structures, jungle
// ---------------------------------------------------------------------------
const FOUNTAIN = [{ x: S(190), y: S(3410), r: 260 }, { x: S(3410), y: S(190), r: 260 }];
const CORE_POS = [{ x: S(470), y: S(3130) }, mirror({ x: S(470), y: S(3130) })];

// Structure order per team: top outer, top inner, mid outer, mid inner, bot outer, bot inner, core.
const STRUCTS = (() => {
  const blue = [];
  const place = (laneId, frac, tier) => {
    const lane = LANES[laneId];
    const p = laneAt(lane, lane.len * frac);
    const off = 75;
    blue.push({ type: 'tower', lane: laneId, tier, x: p.x - p.dy * off, y: p.y + p.dx * off });
  };
  place('top', 0.36, 'outer'); place('top', 0.18, 'inner');
  place('mid', 0.30, 'outer'); place('mid', 0.15, 'inner');
  place('bot', 0.36, 'outer'); place('bot', 0.18, 'inner');
  blue.push({ type: 'core', lane: null, tier: 'core', x: CORE_POS[0].x, y: CORE_POS[0].y });
  const red = blue.map(s => Object.assign({}, s, mirror(s)));
  return [blue, red];
})();
const STRUCT_STATS = {
  outer: { hp: 3500, ad: 210, range: 430, as: 0.85, r: 38 },
  inner: { hp: 4000, ad: 250, range: 430, as: 0.85, r: 38 },
  core: { hp: 6200, ad: 320, range: 470, as: 0.9, r: 64 },
};

const MONSTERS = {
  wisp: { name: 'Azure Wisp', hp: 2600, ad: 42, r: 36, gold: 120, xp: 170, buff: 'azure', respawn: 90, first: 30 },
  brute: { name: 'Ember Brute', hp: 2800, ad: 55, r: 40, gold: 120, xp: 170, buff: 'ember', respawn: 90, first: 30 },
  beetle: { name: 'Moss Beetle', hp: 1300, ad: 30, r: 30, gold: 70, xp: 95, respawn: 60, first: 25 },
  lizard: { name: 'Thorn Lizard', hp: 1300, ad: 32, r: 30, gold: 70, xp: 95, respawn: 60, first: 25 },
  crab: { name: 'Shell Crab', hp: 1150, ad: 28, r: 30, gold: 65, xp: 85, respawn: 60, first: 25 },
  wolf: { name: 'Dusk Wolf', hp: 1200, ad: 34, r: 30, gold: 65, xp: 90, respawn: 60, first: 25 },
  turtle: { name: 'Tidewarden', hp: 6500, ad: 90, r: 62, gold: 120, xp: 220, boss: true, team: true, respawn: 120, first: 120 },
  wyrm: { name: 'Lord', hp: 13000, ad: 150, r: 74, gold: 160, xp: 300, boss: true, team: true, buff: 'wyrm', respawn: 180, first: 480 },
};
// Camps on the blue half; red camps are mirrored copies. Bosses sit in the river.
const CAMPS = (() => {
  const blue = [
    { type: 'wisp', x: 900, y: 1600 }, { type: 'brute', x: 1500, y: 2650 },
    { type: 'beetle', x: 700, y: 2300 }, { type: 'lizard', x: 1150, y: 2030 },
    { type: 'crab', x: 2150, y: 2950 }, { type: 'wolf', x: 650, y: 1150 },
  ];
  const out = [];
  for (const c0 of blue) {
    const c = Object.assign({}, c0, { x: S(c0.x), y: S(c0.y) });
    out.push(Object.assign({ side: BLUE }, c));
    out.push(Object.assign({ side: RED }, c, mirror(c)));
  }
  out.push({ type: 'turtle', side: NEUTRAL, x: S(2450), y: S(2450) });
  out.push({ type: 'wyrm', side: NEUTRAL, x: S(1150), y: S(1150) });
  return out;
})();

// Rocks and tree clumps that block movement. Generated once, mirrored for symmetry.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const OBSTACLES = (() => {
  const rnd = mulberry32(2024);
  const blue = [];
  const clearOf = (x, y, r) => {
    for (const id of LANE_IDS) if (laneProject(LANES[id], x, y).d < r + 170) return false;
    for (const c of CAMPS) if (Math.hypot(c.x - x, c.y - y) < r + (c.side === NEUTRAL ? 430 : 210)) return false;
    for (const f of FOUNTAIN) if (Math.hypot(f.x - x, f.y - y) < r + 600) return false;
    for (const t of STRUCTS[0].concat(STRUCTS[1])) if (Math.hypot(t.x - x, t.y - y) < r + 200) return false;
    if (Math.abs(x - y) / Math.SQRT2 < r + 150) return false; // keep the river open
    if (y - x < r + 150) return false; // blue half only
    for (const o of blue) {
      if (Math.hypot(o.x - x, o.y - y) < o.r + r + 115) return false;
      const m = mirror(o);
      if (Math.hypot(m.x - x, m.y - y) < o.r + r + 115) return false;
    }
    return x > r + 40 && y < H - r - 40;
  };
  for (let i = 0; i < 6000 && blue.length < 52; i++) {
    const x = 200 + rnd() * (W - 400), y = 200 + rnd() * (H - 400), r = 50 + rnd() * 50;
    if (clearOf(x, y, r)) blue.push({ x, y, r, kind: rnd() < 0.62 ? 'tree' : 'rock', seed: (rnd() * 1e6) | 0 });
  }
  const out = [];
  for (const o of blue) { out.push(o); out.push(Object.assign({}, o, mirror(o), { seed: o.seed + 7 })); }
  return out;
})();

// Bushes: heroes inside are hidden from the enemy team. Placed beside the lanes and
// in the jungle on the blue half, then mirrored.
const BUSHES = (() => {
  const rnd = mulberry32(4242);
  const blue = [];
  const clearOf = (x, y, r) => {
    if (x < r + 40 || y > H - r - 40 || x > W - r - 40 || y < r + 40) return false;
    if (y - x < r + 60) return false; // blue half, off the river centre
    for (const o of OBSTACLES) if (Math.hypot(o.x - x, o.y - y) < o.r + r + 15) return false;
    for (const c of CAMPS) if (Math.hypot(c.x - x, c.y - y) < r + (c.side === NEUTRAL ? 400 : 135)) return false;
    for (const f of FOUNTAIN) if (Math.hypot(f.x - x, f.y - y) < r + 700) return false;
    for (const t of STRUCTS[0].concat(STRUCTS[1])) if (Math.hypot(t.x - x, t.y - y) < r + 130) return false;
    for (const b of blue) {
      if (Math.hypot(b.x - x, b.y - y) < b.r + r + 140) return false;
      const m = mirror(b);
      if (Math.hypot(m.x - x, m.y - y) < b.r + r + 140) return false;
    }
    return true;
  };
  // Beside each lane, both sides
  for (const id of LANE_IDS) {
    const L = LANES[id];
    for (let f = 0.14; f < 0.49; f += 0.025) {
      for (const side of [-1, 1]) {
        for (const dist of [230, 270]) {
          const p = laneAt(L, L.len * f), off = dist * side, r = 100 + rnd() * 20;
          const x = p.x - p.dy * off, y = p.y + p.dx * off;
          if (clearOf(x, y, r)) { blue.push({ x, y, r, seed: (rnd() * 1e6) | 0 }); break; }
        }
      }
    }
  }
  // Jungle
  const laneCount = blue.length;
  for (let i = 0; i < 9000 && blue.length < laneCount + 10; i++) {
    const x = 300 + rnd() * (W - 600), y = 300 + rnd() * (H - 600), r = 100 + rnd() * 30;
    let nearLane = false;
    for (const id of LANE_IDS) if (laneProject(LANES[id], x, y).d < r + 140) nearLane = true;
    if (!nearLane && clearOf(x, y, r)) blue.push({ x, y, r, seed: (rnd() * 1e6) | 0 });
  }
  const out = [];
  for (const b of blue) { out.push(b); out.push(Object.assign({}, b, mirror(b), { seed: b.seed + 11 })); }
  return out;
})();
function bushAt(x, y) {
  for (let i = 0; i < BUSHES.length; i++) {
    const b = BUSHES[i], dx = x - b.x, dy = y - b.y;
    if (dx * dx + dy * dy < b.r * b.r) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
// Slot index on each team = role index.
const ROLES = [
  { id: 'exp', name: 'EXP Lane', short: 'EXP', lane: 'top', desc: 'Durable fighters who hold the top lane alone.' },
  { id: 'jungle', name: 'Jungle', short: 'JGL', lane: null, desc: 'Assassins who farm monsters and ambush lanes.' },
  { id: 'mid', name: 'Mid Lane', short: 'MID', lane: 'mid', desc: 'Mages with burst damage and crowd control.' },
  { id: 'gold', name: 'Gold Lane', short: 'GOLD', lane: 'bot', desc: 'Marksmen who scale into the main damage dealer.' },
  { id: 'roam', name: 'Roam', short: 'ROAM', lane: null, desc: 'Tanks and healers who protect the team.' },
];
const ROLE_INDEX = Object.fromEntries(ROLES.map((r, i) => [r.id, i]));

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
// Three tiers. Tier 3 pieces are bought outright. Tier 2 items are crafted from 1-2 Tier 3 pieces and
// Tier 1 items from 2-3 Tier 2 items. `cost` is the full price: the crafting fee (`price`) plus the full
// price of every part. Parts you already own are used up and take part of their price off (see sim.js).
// `stats` are normal attributes and add up. `unique` attributes and the `passive` only count once per
// item, however many copies you own.
const ITEMS = [
  // ----- Tier 3: basic pieces -----
  { id: 'dagger', tier: 3, name: 'Iron Dagger', icon: 'dagger', cat: 'Attack', price: 180, stats: { ad: 10 }, desc: 'A small blade. The start of every attack item.' },
  { id: 'feather', tier: 3, name: 'Swift Feather', icon: 'feather', cat: 'Attack', price: 200, stats: { as: 0.1 }, desc: 'Light as air. Makes you attack a little faster.' },
  { id: 'gem', tier: 3, name: 'Arcane Gem', icon: 'gem', cat: 'Magic', price: 200, stats: { ap: 20 }, desc: 'A glowing gem that powers up skills.' },
  { id: 'shard', tier: 3, name: 'Mana Shard', icon: 'shard', cat: 'Magic', price: 150, stats: { mana: 120, manaRegen: 2 }, desc: 'A sliver of crystal full of mana.' },
  { id: 'ruby', tier: 3, name: 'Vital Ruby', icon: 'ruby', cat: 'Defense', price: 180, stats: { hp: 150 }, desc: 'A warm red stone that adds health.' },
  { id: 'chain', tier: 3, name: 'Chain Vest', icon: 'chain', cat: 'Defense', price: 180, stats: { armor: 10 }, desc: 'Linked rings of steel. A little armor.' },
  { id: 'leaf', tier: 3, name: 'Healing Leaf', icon: 'leaf', cat: 'Defense', price: 150, stats: { regen: 3 }, desc: 'Chew it to recover health over time.' },
  { id: 'boots', tier: 3, name: 'Leather Boots', icon: 'boots', cat: 'Movement', price: 200, stats: { ms: 15 }, desc: 'Plain boots. Upgrade them into one of the Tier 2 boots.' },

  // ----- Tier 2: crafted from Tier 3 -----
  { id: 'longsword', tier: 2, name: 'Longsword', icon: 'sword', cat: 'Attack', from: ['dagger', 'dagger'], price: 180, stats: { ad: 28 }, desc: 'Plain, heavy and reliable. Part of many attack items.' },
  { id: 'bow', tier: 2, name: 'Recurve Bow', icon: 'bow', cat: 'Attack', from: ['feather', 'dagger'], price: 170, stats: { ad: 12, as: 0.18 }, desc: 'Attack and attack speed for marksmen.' },
  { id: 'glove', tier: 2, name: 'Hawk Glove', icon: 'glove', cat: 'Attack', from: ['feather', 'dagger'], price: 170, stats: { ad: 10, as: 0.1 }, unique: { crit: 0.15 }, desc: 'A sharp eye: some attacks land as critical hits.' },
  { id: 'fang', tier: 2, name: 'Vampire Fang', icon: 'fang', cat: 'Attack', from: ['dagger', 'leaf'], price: 170, stats: { ad: 14, regen: 3 }, unique: { ls: 0.08 }, desc: 'Drinks a little of every hit you land.' },
  { id: 'machete', tier: 2, name: 'Hunter Machete', icon: 'machete', cat: 'Jungle', from: ['dagger'], price: 120, stats: { ad: 14 }, unique: { monster: 0.4 }, desc: 'A jungler\'s first buy. Clears monster camps much faster.' },
  { id: 'tome', tier: 2, name: 'Sage Tome', icon: 'tome', cat: 'Magic', from: ['gem', 'gem'], price: 170, stats: { ap: 50 }, unique: { magicPen: 0.08 }, desc: 'Old spells that slip past armor.' },
  { id: 'focus', tier: 2, name: 'Focus Orb', icon: 'orb', cat: 'Magic', from: ['gem', 'shard'], price: 180, stats: { ap: 35, mana: 180, manaRegen: 2 }, desc: 'Magic power and a deep mana pool.' },
  { id: 'hourglass', tier: 2, name: 'Hourglass', icon: 'clock', cat: 'Magic', from: ['shard', 'leaf'], price: 200, stats: { mana: 120, regen: 3, cdr: 0.1 }, desc: 'Skills come back sooner. Used by mages, fighters and tanks alike.' },
  { id: 'belt', tier: 2, name: 'Giant\'s Belt', icon: 'belt', cat: 'Defense', from: ['ruby', 'ruby'], price: 170, stats: { hp: 380 }, desc: 'A huge chunk of health. Part of many defense items.' },
  { id: 'plate', tier: 2, name: 'Scale Plate', icon: 'armor', cat: 'Defense', from: ['chain', 'ruby'], price: 180, stats: { armor: 20, hp: 180 }, desc: 'Armor and health in one.' },
  { id: 'warboots', tier: 2, name: 'Warrior Boots', icon: 'boots', cat: 'Movement', from: ['boots', 'chain'], price: 170, stats: { ms: 30, armor: 12 }, unique: { tenacity: 0.2 }, desc: 'For fighters and tanks: armor and shorter stuns and slows.' },
  { id: 'magicboots', tier: 2, name: 'Arcane Sandals', icon: 'boots', cat: 'Movement', from: ['boots', 'shard'], price: 170, stats: { ms: 30, cdr: 0.1 }, desc: 'For mages and supports: faster skills.' },
  { id: 'swiftboots', tier: 2, name: 'Swift Boots', icon: 'boots', cat: 'Movement', from: ['boots', 'feather'], price: 150, stats: { ms: 30, as: 0.15 }, desc: 'For marksmen and junglers: faster attacks.' },

  // ----- Tier 1: crafted from Tier 2, each with a unique passive -----
  { id: 'ruinblade', tier: 1, name: 'Ruinblade', icon: 'greatsword', cat: 'Attack', from: ['longsword', 'fang', 'bow'], price: 400, stats: { ad: 60, as: 0.2, regen: 3 }, unique: { ls: 0.1 },
    passive: { id: 'ruin', name: 'Ruin', text: 'Basic attacks deal bonus damage equal to 5% of the target\'s current health (up to 80 against monsters).' },
    desc: 'Cuts down even the toughest targets. A core item for marksmen and fighters.' },
  { id: 'tempest', tier: 1, name: 'Tempest Bow', icon: 'stormbow', cat: 'Attack', from: ['bow', 'glove'], price: 450, stats: { ad: 30, as: 0.35 }, unique: { crit: 0.25 },
    passive: { id: 'gale', name: 'Chain Lightning', text: 'Every 3rd basic attack sends lightning to 2 more enemies nearby for 60 + 30% attack damage.' },
    desc: 'Fast, critical attacks that arc between enemies.' },
  { id: 'executioner', tier: 1, name: 'Executioner', icon: 'axe', cat: 'Attack', from: ['longsword', 'longsword', 'glove'], price: 400, stats: { ad: 75, as: 0.1 }, unique: { armorPen: 0.2, crit: 0.15 },
    passive: { id: 'despair', name: 'Despair', text: 'Deal 20% more damage to enemy heroes below half health.' },
    desc: 'Huge attack and armor penetration. Finishes off wounded heroes.' },
  { id: 'warhammer', tier: 1, name: 'Warhammer', icon: 'hammer', cat: 'Attack', from: ['longsword', 'belt', 'hourglass'], price: 380, stats: { ad: 40, hp: 450, mana: 120, regen: 3, cdr: 0.15 },
    passive: { id: 'fury', name: 'Fury', text: 'Using a skill grants 10% attack for 4 seconds, stacking up to 3 times.' },
    desc: 'Attack, health and faster skills. Made for fighters.' },
  { id: 'bloodhunter', tier: 1, name: 'Bloodhunter', icon: 'machete', cat: 'Jungle', from: ['machete', 'longsword', 'fang'], price: 400, stats: { ad: 55, regen: 3 }, unique: { monster: 0.6, ls: 0.1 },
    passive: { id: 'hunt', name: 'Hunt', text: 'Killing a monster restores 12% of your max health and mana.' },
    desc: 'The finished jungle weapon. Clears camps fast and keeps you topped up.' },
  { id: 'bloodbloom', tier: 1, name: 'Bloodbloom', icon: 'flower', cat: 'Attack', from: ['belt', 'fang', 'longsword'], price: 400, stats: { ad: 45, hp: 450, regen: 3 }, unique: { ls: 0.1 },
    passive: { id: 'rampage', name: 'Rampage', text: 'Skills that hit an enemy hero heal you for 3% of your max health (once per 0.5 seconds).' },
    desc: 'Sustain for fighters who brawl with skills.' },
  { id: 'voidcrown', tier: 1, name: 'Void Crown', icon: 'crown', cat: 'Magic', from: ['tome', 'tome', 'focus'], price: 430, stats: { ap: 150, mana: 200, manaRegen: 3 }, unique: { magicPen: 0.2 },
    passive: { id: 'void', name: 'Void', text: 'Skills deal 10% more damage.' },
    desc: 'The biggest magic power in the shop. A mage\'s final damage item.' },
  { id: 'starcaller', tier: 1, name: 'Starcaller', icon: 'staff', cat: 'Magic', from: ['focus', 'hourglass'], price: 450, stats: { ap: 75, mana: 350, manaRegen: 3, cdr: 0.2 }, unique: { spellVamp: 0.1 },
    passive: { id: 'echo', name: 'Echo', text: 'Every 8 seconds, your next skill hit deals 80 + 30% magic power bonus damage.' },
    desc: 'Magic power, mana and fast cooldowns for spell-heavy heroes.' },
  { id: 'oracle', tier: 1, name: 'Oracle Charm', icon: 'charm', cat: 'Defense', from: ['hourglass', 'belt'], price: 420, stats: { hp: 500, regen: 6, mana: 120, cdr: 0.15 }, unique: { healing: 0.25 },
    passive: { id: 'blessing', name: 'Blessing', text: 'Allies you heal or shield also get 20% move speed for 2 seconds.' },
    desc: 'Stronger heals and faster skills. Made for supports.' },
  { id: 'bulwark', tier: 1, name: 'Bulwark', icon: 'helm', cat: 'Defense', from: ['plate', 'belt', 'belt'], price: 400, stats: { hp: 1100, armor: 25 }, unique: { tenacity: 0.25 },
    passive: { id: 'fortify', name: 'Fortify', text: 'Dropping below 40% health grants a shield worth 25% of your max health (30 second cooldown).' },
    desc: 'A wall of health. Keeps tanks and carries alive in big fights.' },
  { id: 'thornmail', tier: 1, name: 'Thornmail', icon: 'thorns', cat: 'Defense', from: ['plate', 'plate'], price: 420, stats: { armor: 55, hp: 350 },
    passive: { id: 'thorns', name: 'Thorns', text: 'Enemy heroes that basic attack you take 15% of that damage back as true damage.' },
    desc: 'Heavy armor that punishes marksmen and assassins.' },
  { id: 'frostheart', tier: 1, name: 'Frostheart', icon: 'frost', cat: 'Defense', from: ['plate', 'hourglass'], price: 420, stats: { armor: 35, hp: 200, mana: 250, regen: 3, cdr: 0.15 },
    passive: { id: 'frostbite', name: 'Frostbite', text: 'Enemy heroes that basic attack you are slowed by 20% for 1 second.' },
    desc: 'Armor and faster skills. Slows down anyone who hits you.' },
];
const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const ITEM_INDEX = Object.fromEntries(ITEMS.map((i, n) => [i.id, n]));
const STAT_LABEL = {
  ad: v => `+${v} attack`, ap: v => `+${v} magic power`, hp: v => `+${v} health`, mana: v => `+${v} mana`, armor: v => `+${v} armor`,
  as: v => `+${Math.round(v * 100)}% attack speed`, ms: v => `+${v} move speed`, cdr: v => `${Math.round(v * 100)}% cooldown reduction`,
  regen: v => `+${v} health per second`, manaRegen: v => `+${v} mana per second`,
  crit: v => `${Math.round(v * 100)}% critical chance`, armorPen: v => `${Math.round(v * 100)}% armor penetration (attacks)`,
  magicPen: v => `${Math.round(v * 100)}% magic penetration (skills)`, spellVamp: v => `${Math.round(v * 100)}% spell vamp`,
  ls: v => `${Math.round(v * 100)}% lifesteal`, tenacity: v => `${Math.round(v * 100)}% shorter crowd control`,
  healing: v => `heals ${Math.round(v * 100)}% stronger`, monster: v => `+${Math.round(v * 100)}% damage to monsters`,
};
const statLines = o => Object.entries(o || {}).map(([k, v]) => STAT_LABEL[k](v));
for (const it of ITEMS) {
  it.cost = it.price + (it.from || []).reduce((s, c) => s + ITEM[c].cost, 0);
  it.into = ITEMS.filter(o => o.from && o.from.includes(it.id)).map(o => o.id);
  it.boots = it.id === 'boots' || (it.from || []).includes('boots');
  it.lines = statLines(it.stats); it.uniqueLines = statLines(it.unique);
  it.text = it.lines.concat(it.uniqueLines).join(', ');
}

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------
// Skill damage = b + l * (level - 1) + ad * attack + ap * magic power (+ hp * own max health).
// Skill types: line, circle, nova, cone, dash, leap, blink, buff, zone, execute.
// `ai` tells bots when to use it: harass, engage, escape, buff, heal, aoe, execute.
const HEROES = [
  // ----- Gold lane: marksmen -----
  {
    id: 'kestra', name: 'Kestra', role: 'gold', cls: 'Marksman', title: 'Windborne Archer', buildNote: 'Swift Boots, then Tempest Bow for crits and chain lightning. Ruinblade and Executioner shred tanks; defense last.',
    stats: { hp: 560, hpL: 95, mana: 420, manaL: 35, ad: 58, adL: 5.5, armor: 14, armorL: 2, as: 0.85, asL: 0.025, range: 290, ms: 200, regen: 4 },
    look: { skin: '#f0c9a5', main: '#2f7d55', trim: '#e9d58a', hair: '#8a4b2a', pants: '#3b3527', head: 'hood', weapon: 'bow', body: 'slim', cape: true },
    attack: { proj: 'arrow', speed: 1400 },
    passive: { id: 'thirdshot', name: 'Third Feather', desc: 'Every third attack deals 60% bonus damage and slows by 25%.' },
    skills: [
      { key: 's1', name: 'Piercing Arrow', type: 'line', cd: 7, mana: 50, range: 650, speed: 1700, width: 40, pierce: true, vis: 'bigarrow', dmg: { b: 120, l: 22, ad: 0.9 }, cc: { slow: 0.3, dur: 1.5 }, ai: 'harass', desc: 'Fires an arrow that passes through every enemy in a line and slows them.' },
      { key: 's2', name: 'Tumble', type: 'dash', cd: 10, mana: 40, range: 300, speed: 1500, empower: 0.5, buff: { ms: 0.3, dur: 2 }, ai: 'escape', desc: 'Rolls a short distance. The next attack deals 50% bonus damage.' },
      { key: 'ult', name: 'Arrow Storm', type: 'zone', cd: 40, mana: 90, range: 650, radius: 260, dur: 2.5, tick: 0.5, vis: 'rain', dmg: { b: 70, l: 16, ad: 0.35 }, cc: { slow: 0.35, dur: 0.6 }, ai: 'aoe', desc: 'Rains arrows on an area, damaging and slowing enemies inside.' },
    ],
    build: ['swiftboots', 'tempest', 'ruinblade', 'executioner', 'thornmail', 'bulwark'],
  },
  {
    id: 'dax', name: 'Dax', role: 'gold', cls: 'Marksman', title: 'Dustline Gunslinger', buildNote: 'Attack speed to stack Hot Barrels: Ruinblade first for sustain, then crits and armor penetration.',
    stats: { hp: 580, hpL: 98, mana: 400, manaL: 32, ad: 55, adL: 5, armor: 15, armorL: 2, as: 0.9, asL: 0.03, range: 270, ms: 200, regen: 4 },
    look: { skin: '#c98d63', main: '#8a5a32', trim: '#f0b54a', hair: '#2b2b2b', pants: '#2f2b28', head: 'hat', weapon: 'guns', body: 'slim', cape: false },
    attack: { proj: 'bullet', speed: 1800 },
    passive: { id: 'hotbarrels', name: 'Hot Barrels', desc: 'Each attack grants 7% attack speed for 3 seconds, stacking 6 times.' },
    skills: [
      { key: 's1', name: 'Scatter Shot', type: 'cone', cd: 6, mana: 45, range: 360, angle: 0.9, vis: 'shot', dmg: { b: 140, l: 24, ad: 1.0 }, ai: 'harass', desc: 'Blasts a cone of buckshot in front of him.' },
      { key: 's2', name: 'Overdrive', type: 'buff', cd: 14, mana: 50, buff: { as: 0.45, ms: 0.2, dur: 4 }, ai: 'buff', desc: 'Gains 45% attack speed and 20% move speed for 4 seconds.' },
      { key: 'ult', name: 'Deadeye', type: 'line', cd: 45, mana: 100, range: 1100, speed: 2800, width: 50, heroOnly: true, vis: 'snipe', dmg: { b: 320, l: 45, ad: 1.6 }, ai: 'execute', desc: 'A long shot that strikes the first enemy hero in its path.' },
    ],
    build: ['swiftboots', 'ruinblade', 'tempest', 'executioner', 'bulwark', 'thornmail'],
  },
  // ----- EXP lane: fighters -----
  {
    id: 'brann', name: 'Brann', role: 'exp', cls: 'Fighter', title: 'Ironmane Berserker', buildNote: 'Bloodbloom and Warhammer keep him healing and hitting harder after every skill, then armor and health.',
    stats: { hp: 780, hpL: 125, mana: 380, manaL: 30, ad: 66, adL: 5.5, armor: 22, armorL: 3, as: 0.8, asL: 0.015, range: 70, ms: 210, regen: 7 },
    look: { skin: '#e2b08a', main: '#9b3b2e', trim: '#c9c9c9', hair: '#d68a3a', pants: '#4a3426', head: 'horns', weapon: 'axe', body: 'broad', cape: true },
    attack: { melee: true },
    passive: { id: 'bloodlust', name: 'Bloodlust', desc: 'Heals for 15% of all damage he deals.' },
    skills: [
      { key: 's1', name: 'Cleave', type: 'nova', cd: 6, mana: 40, radius: 210, vis: 'cleave', dmg: { b: 130, l: 22, ad: 0.8 }, healPerHero: 0.05, ai: 'aoe', desc: 'Swings his axe around him and heals 5% max health per hero hit.' },
      { key: 's2', name: 'Charge', type: 'dash', cd: 11, mana: 50, range: 360, speed: 1300, width: 60, stopOnHero: true, dmg: { b: 90, l: 15, ad: 0.6 }, cc: { stun: 0.8 }, ai: 'engage', desc: 'Charges forward. The first enemy hero hit is stunned.' },
      { key: 'ult', name: 'Warcry Leap', type: 'leap', cd: 40, mana: 80, range: 500, radius: 260, vis: 'slam', dmg: { b: 220, l: 35, ad: 1.1 }, cc: { slow: 0.4, dur: 2 }, buff: { ad: 0.25, dur: 5 }, ai: 'engage', desc: 'Leaps into an area, slows enemies and gains 25% attack for 5 seconds.' },
    ],
    build: ['warboots', 'bloodbloom', 'warhammer', 'thornmail', 'bulwark', 'ruinblade'],
  },
  {
    id: 'sela', name: 'Sela', role: 'exp', cls: 'Fighter', title: 'Shieldmaiden of the Tide', buildNote: 'Warhammer turns every skill into extra damage; Frostheart and Bulwark make her hard to kill.',
    stats: { hp: 740, hpL: 120, mana: 380, manaL: 30, ad: 64, adL: 5.5, armor: 24, armorL: 3, as: 0.85, asL: 0.015, range: 95, ms: 210, regen: 7 },
    look: { skin: '#f3d2b8', main: '#3d5fa8', trim: '#e8e3d0', hair: '#f2e3a0', pants: '#2d3446', head: 'winged', weapon: 'spear', body: 'slim', cape: true },
    attack: { melee: true },
    passive: { id: 'riposte', name: 'Riposte', desc: 'After using a skill, her next attack deals 60% bonus damage and heals her.' },
    skills: [
      { key: 's1', name: 'Spear Thrust', type: 'line', cd: 5, mana: 35, range: 460, speed: 2200, width: 60, pierce: true, vis: 'spear', dmg: { b: 140, l: 24, ad: 1.0 }, cc: { slow: 0.25, dur: 1.5 }, ai: 'harass', desc: 'Thrusts her spear forward, hitting every enemy in a line.' },
      { key: 's2', name: 'Shieldwall', type: 'buff', cd: 12, mana: 45, buff: { shield: { b: 180, l: 30, hp: 0.08 }, ms: 0.3, dur: 3 }, ai: 'buff', desc: 'Raises a shield that absorbs damage and gains 30% move speed.' },
      { key: 'ult', name: 'Whirlwind', type: 'zone', follow: true, cd: 38, mana: 80, radius: 230, dur: 2.5, tick: 0.25, vis: 'whirl', dmg: { b: 45, l: 8, ad: 0.25 }, buff: { ms: 0.2, dur: 2.5 }, ai: 'aoe', desc: 'Spins her spear for 2.5 seconds, damaging everything around her.' },
    ],
    build: ['warboots', 'warhammer', 'bloodbloom', 'frostheart', 'bulwark', 'thornmail'],
  },
  // ----- Mid lane: mages -----
  {
    id: 'lumen', name: 'Lumen', role: 'mid', cls: 'Mage', title: 'Keeper of the Last Light', buildNote: 'Starcaller for cooldowns and Echo bursts, then Void Crown for raw power. Health and armor last.',
    stats: { hp: 540, hpL: 90, mana: 520, manaL: 45, ad: 50, adL: 3, armor: 12, armorL: 2, as: 0.75, asL: 0.015, range: 270, ms: 200, regen: 4 },
    look: { skin: '#f6dcc3', main: '#f1efe6', trim: '#f0c24e', hair: '#f7f1d0', pants: '#cfc8b4', head: 'hair', weapon: 'staff', body: 'robe', cape: false },
    attack: { proj: 'light', speed: 1200 },
    passive: { id: 'radiance', name: 'Radiance', desc: 'Skills deal 15% bonus damage to enemies below half health.' },
    skills: [
      { key: 's1', name: 'Arc Bolt', type: 'line', cd: 5, mana: 55, range: 650, speed: 1350, width: 38, vis: 'bolt', dmg: { b: 150, l: 28, ap: 0.8 }, ai: 'harass', desc: 'Fires a bolt of light that hits the first enemy.' },
      { key: 's2', name: 'Radiant Field', type: 'circle', cd: 11, mana: 70, range: 560, radius: 200, delay: 0.7, vis: 'field', dmg: { b: 130, l: 24, ap: 0.6 }, cc: { stun: 1.0 }, ai: 'engage', desc: 'Marks an area. After a moment it bursts and stuns enemies inside.' },
      { key: 'ult', name: 'Starfall', type: 'circle', cd: 42, mana: 110, range: 650, radius: 280, delay: 1.0, vis: 'star', dmg: { b: 380, l: 55, ap: 1.2 }, ai: 'aoe', desc: 'Calls a falling star onto a large area.' },
    ],
    build: ['magicboots', 'starcaller', 'voidcrown', 'frostheart', 'bulwark', 'oracle'],
  },
  {
    id: 'nyx', name: 'Nyx', role: 'mid', cls: 'Mage', title: 'Witch of the Hollow Moon', buildNote: 'Void Crown first so Hex Orb and Void Rift hit hard through armor, then cooldowns and defense.',
    stats: { hp: 550, hpL: 92, mana: 500, manaL: 45, ad: 48, adL: 3, armor: 12, armorL: 2, as: 0.75, asL: 0.015, range: 270, ms: 200, regen: 4 },
    look: { skin: '#dccbea', main: '#4a2a6e', trim: '#b98cff', hair: '#1d1230', pants: '#2a1940', head: 'witch', weapon: 'orb', body: 'robe', cape: true },
    attack: { proj: 'hex', speed: 1100 },
    passive: { id: 'hex', name: 'Hex', desc: 'Skill hits slow enemies by 20% for 1.2 seconds.' },
    skills: [
      { key: 's1', name: 'Hex Orb', type: 'line', cd: 9, mana: 60, range: 620, speed: 1050, width: 46, vis: 'hexorb', dmg: { b: 140, l: 24, ap: 0.7 }, cc: { stun: 0.9 }, ai: 'engage', desc: 'Throws a cursed orb that stuns the first enemy it hits.' },
      { key: 's2', name: 'Shade Step', type: 'blink', cd: 12, mana: 50, range: 320, ai: 'escape', desc: 'Steps through the shadows to a nearby spot.' },
      { key: 'ult', name: 'Void Rift', type: 'zone', cd: 40, mana: 100, range: 580, radius: 250, dur: 3, tick: 0.5, pull: 140, vis: 'rift', dmg: { b: 90, l: 16, ap: 0.35 }, cc: { slow: 0.5, dur: 0.6 }, ai: 'aoe', desc: 'Tears open a rift that drags enemies toward its center.' },
    ],
    build: ['magicboots', 'voidcrown', 'starcaller', 'frostheart', 'thornmail', 'bulwark'],
  },
  // ----- Jungle: assassins -----
  {
    id: 'rook', name: 'Rook', role: 'jungle', cls: 'Assassin', title: 'The Quiet Knife', buildNote: 'Bloodhunter for the jungle, then Executioner to finish heroes below half health.',
    stats: { hp: 640, hpL: 100, mana: 400, manaL: 30, ad: 68, adL: 6, armor: 18, armorL: 2.5, as: 0.9, asL: 0.02, range: 65, ms: 225, regen: 5 },
    look: { skin: '#caa48a', main: '#2a2f3a', trim: '#7ad1c9', hair: '#111111', pants: '#1c2028', head: 'mask', weapon: 'daggers', body: 'slim', cape: true },
    attack: { melee: true },
    passive: { id: 'ambush', name: 'Ambush', desc: 'The first attack after 4 seconds out of combat deals 80% bonus damage. Deals 40% more to monsters.' },
    skills: [
      { key: 's1', name: 'Shadow Dash', type: 'dash', cd: 6, mana: 35, range: 400, speed: 1700, width: 70, dmg: { b: 110, l: 20, ad: 0.8 }, ai: 'engage', jungle: true, desc: 'Dashes through enemies, cutting everything in his path.' },
      { key: 's2', name: 'Fan of Knives', type: 'nova', cd: 7, mana: 40, radius: 250, vis: 'knives', dmg: { b: 120, l: 22, ad: 0.7 }, cc: { slow: 0.3, dur: 1.5 }, ai: 'aoe', jungle: true, desc: 'Throws knives in every direction and slows enemies hit.' },
      { key: 'ult', name: 'Execute', type: 'execute', cd: 30, mana: 70, range: 420, dmg: { b: 260, l: 40, ad: 1.2, missing: 0.25 }, ai: 'execute', desc: 'Blinks to the nearest enemy hero and strikes for damage that grows with their missing health. Refunds half its cooldown on a kill.' },
    ],
    build: ['bloodhunter', 'warboots', 'executioner', 'ruinblade', 'warhammer', 'bulwark'],
  },
  {
    id: 'vex', name: 'Vex', role: 'jungle', cls: 'Assassin', title: 'Redclaw Stalker', buildNote: 'Bloodhunter for the jungle, then attack speed and lifesteal for long fights.',
    stats: { hp: 660, hpL: 105, mana: 380, manaL: 28, ad: 66, adL: 6, armor: 18, armorL: 2.5, as: 0.9, asL: 0.025, range: 65, ms: 225, regen: 5 },
    look: { skin: '#b9806a', main: '#7a2e2e', trim: '#ffb04a', hair: '#e04a3a', pants: '#3a1e1a', head: 'beast', weapon: 'claws', body: 'slim', cape: false },
    attack: { melee: true },
    passive: { id: 'feral', name: 'Feral', desc: 'Attacks heal for 10% of damage dealt. Deals 40% more to monsters.' },
    skills: [
      { key: 's1', name: 'Pounce', type: 'leap', cd: 8, mana: 40, range: 420, radius: 170, vis: 'pounce', dmg: { b: 130, l: 22, ad: 0.9 }, cc: { slow: 0.3, dur: 1.5 }, ai: 'engage', jungle: true, desc: 'Leaps to a spot and rakes enemies where she lands.' },
      { key: 's2', name: 'Rend', type: 'cone', cd: 5, mana: 30, range: 280, angle: 1.6, vis: 'claw', dmg: { b: 115, l: 20, ad: 0.8 }, cc: { slow: 0.2, dur: 1 }, ai: 'harass', jungle: true, desc: 'Slashes in a wide arc in front of her.' },
      { key: 'ult', name: 'Bloodfrenzy', type: 'buff', cd: 40, mana: 60, buff: { as: 0.5, ms: 0.25, ls: 0.2, dur: 6 }, ai: 'buff', desc: 'For 6 seconds gains 50% attack speed, 25% move speed and 20% lifesteal.' },
    ],
    build: ['bloodhunter', 'swiftboots', 'tempest', 'ruinblade', 'bloodbloom', 'thornmail'],
  },
  // ----- Roam: tank and support -----
  {
    id: 'gorr', name: 'Gorr', role: 'roam', cls: 'Tank', title: 'The Walking Mountain', buildNote: 'All defense: soak damage, slow attackers and reflect damage so the carries can fight safely.',
    stats: { hp: 920, hpL: 140, mana: 400, manaL: 30, ad: 52, adL: 3.5, armor: 30, armorL: 4, as: 0.7, asL: 0.01, range: 75, ms: 205, regen: 9 },
    look: { skin: '#8f9aa3', main: '#5f6b52', trim: '#c7b27a', hair: '#5d6670', pants: '#3b4234', head: 'stone', weapon: 'mace', body: 'heavy', cape: false, scale: 1.12 },
    attack: { melee: true },
    passive: { id: 'granite', name: 'Granite Skin', desc: 'Takes 15% less damage from every source.' },
    skills: [
      { key: 's1', name: 'Shield Bash', type: 'dash', cd: 10, mana: 45, range: 320, speed: 1200, width: 70, stopOnHero: true, dmg: { b: 80, l: 14, hp: 0.03 }, cc: { stun: 1.0 }, ai: 'engage', desc: 'Rushes forward behind his shield and stuns the first hero hit.' },
      { key: 's2', name: 'Rallying Roar', type: 'nova', cd: 13, mana: 60, radius: 320, vis: 'roar', cc: { slow: 0.4, dur: 2 }, allyShield: { b: 120, l: 20, hp: 0.05, dur: 3 }, ai: 'buff', desc: 'Slows nearby enemies and shields himself and nearby allies.' },
      { key: 'ult', name: 'Earthquake', type: 'circle', cd: 45, mana: 100, range: 360, radius: 330, delay: 0.45, vis: 'quake', dmg: { b: 150, l: 25, hp: 0.04 }, cc: { stun: 1.4 }, ai: 'engage', desc: 'Slams the ground, stunning every enemy in a wide area.' },
    ],
    build: ['warboots', 'bulwark', 'thornmail', 'frostheart', 'oracle', 'warhammer'],
  },
  {
    id: 'mira', name: 'Mira', role: 'roam', cls: 'Support', title: 'Bloom of the Glade', buildNote: 'Oracle Charm for stronger heals that speed up allies, then cooldowns and health.',
    stats: { hp: 640, hpL: 100, mana: 480, manaL: 40, ad: 46, adL: 3, armor: 18, armorL: 2.5, as: 0.75, asL: 0.015, range: 260, ms: 200, regen: 5 },
    look: { skin: '#f2cdb0', main: '#6bbf8a', trim: '#f7a6c1', hair: '#c06a3a', pants: '#3e6a4e', head: 'flower', weapon: 'wand', body: 'robe', cape: true },
    attack: { proj: 'petal', speed: 1150 },
    passive: { id: 'verdant', name: 'Verdant', desc: 'Nearby allies regenerate health, and her heals are 20% stronger.' },
    skills: [
      { key: 's1', name: 'Thorn Snare', type: 'line', cd: 9, mana: 55, range: 620, speed: 1150, width: 46, vis: 'snare', dmg: { b: 90, l: 16, ap: 0.5 }, cc: { root: 1.3 }, ai: 'engage', desc: 'Throws a seed that roots the first enemy hit in place.' },
      { key: 's2', name: 'Bloom', type: 'nova', cd: 9, mana: 60, radius: 420, vis: 'bloom', heal: { b: 120, l: 22, ap: 0.5 }, ai: 'heal', desc: 'Heals herself and every nearby ally.' },
      { key: 'ult', name: 'Sanctuary', type: 'zone', cd: 50, mana: 100, range: 520, radius: 300, dur: 3.5, tick: 0.5, vis: 'sanctuary', heal: { b: 60, l: 10, ap: 0.2 }, cc: { slow: 0.3, dur: 0.6 }, ai: 'heal', desc: 'Grows a grove that heals allies and slows enemies inside.' },
    ],
    build: ['magicboots', 'oracle', 'starcaller', 'frostheart', 'bulwark', 'thornmail'],
  },
];
const HERO = Object.fromEntries(HEROES.map(h => [h.id, h]));
const HERO_INDEX = Object.fromEntries(HEROES.map((h, i) => [h.id, i]));
for (const h of HEROES) h.skill = Object.fromEntries(h.skills.map(s => [s.key, s]));

const MINION = {
  melee: { hp: 520, ad: 26, range: 40, as: 0.9, ms: 185, r: 18, gold: 28, xp: 40, armor: 8 },
  caster: { hp: 360, ad: 34, range: 260, as: 0.75, ms: 185, r: 16, gold: 22, xp: 32, armor: 0, proj: 'minion', speed: 750 },
  siege: { hp: 1100, ad: 70, range: 280, as: 0.55, ms: 175, r: 24, gold: 60, xp: 70, armor: 20, proj: 'cannon', speed: 650, siege: 2 },
};

const ULT_LEVEL = 4, MAX_LEVEL = 15;
const xpToNext = lvl => 100 + 60 * lvl;

const DIFFICULTY = {
  easy: { name: 'Easy', think: 0.45, aimErr: 110, brave: 1.35, react: 0.6 },
  normal: { name: 'Normal', think: 0.28, aimErr: 50, brave: 1.0, react: 0.85 },
  hard: { name: 'Hard', think: 0.16, aimErr: 18, brave: 0.85, react: 1 },
};

LF.data = {
  W, H, MAP, BLUE, RED, NEUTRAL, TAU, TEAMS, mirror, LANES, LANE_IDS, laneAt, laneProject,
  FOUNTAIN, CORE_POS, STRUCTS, STRUCT_STATS, MONSTERS, CAMPS, OBSTACLES, BUSHES, bushAt, ROLES, ROLE_INDEX,
  ITEMS, ITEM, ITEM_INDEX, STAT_LABEL, HEROES, HERO, HERO_INDEX, MINION, ULT_LEVEL, MAX_LEVEL, xpToNext, DIFFICULTY, mulberry32,
};
})(window.LF);
