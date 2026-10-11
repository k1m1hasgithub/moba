# Lanefall

A small one-lane MOBA that runs in the browser. You play **Lumen** (blue) against an AI hero, **Vex** (red).
Push with your minion waves, take down the two enemy towers, then destroy the enemy Nexus.

No build step and no dependencies: open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Controls

| Action | Mouse + keyboard | Touch |
| --- | --- | --- |
| Move / attack | Right-click (or left-click) the ground or an enemy; hold to steer | Tap; drag to steer |
| Abilities | `Q` `W` `E` `R`, aimed at the cursor | Ability buttons, auto-aimed |
| Shop | `B` while standing in your fountain | Shop button |
| Stop | `S` | |
| Pause | `P` or `Esc` | Pause button |

The minimap is clickable and moves you to that spot.

## What's in it

- **Map**: one lane with a river ford in the middle. Each side has a fountain (heals allies, burns enemies),
  a Nexus and two towers. A structure can't be damaged until the one in front of it falls.
- **Minions**: a wave of 3 melee and 2 casters spawns every 30 seconds. Every third wave adds a siege minion
  that does double damage to structures. Waves get slightly stronger over time.
- **Towers**: shoot minions first, but switch to any hero who attacks an enemy hero within their range.
- **Heroes**: ranged auto-attacks, levels 1 to 12 from nearby kills, gold from last hits (+2 gold/s passive).
  - `Q` Arc Bolt: skillshot that hits the first enemy.
  - `W` Blink: short teleport.
  - `E` Mend: instant heal.
  - `R` Starfall: delayed area blast, unlocks at level 3.
- **Shop**: Longsword, Ruby Crystal, Sapphire Focus, Swift Boots, Quickglass. Six item slots.
- **AI**: Vex farms minions, pokes with Arc Bolt, fights when ahead, respects your towers,
  retreats to heal when low, buys items and pushes while you're dead.
  The title screen runs an AI-vs-AI match in the background.

## Code layout

- `index.html`: page structure, HUD and styles.
- `game.js`: everything else (simulation, AI, rendering, input), split into labelled sections.
  Tuning constants (stats, costs, cooldowns) are at the top.

In the browser console, `lanefall.game` exposes the current state and `lanefall.step(seconds)` fast-forwards the simulation.
