# Lanefall

A 5v5, three-lane MOBA that runs in the browser. Pick one of ten heroes across five roles, then fight
bots or play with friends in a lobby. Break the two towers in any lane, then destroy the enemy core.

## Run it

```sh
node server.js          # http://localhost:8080 — also enables online multiplayer
# or, single player only:
python3 -m http.server  # http://localhost:8000
```

No build step and no dependencies.

## Multiplayer

The host's browser runs the match and streams compact snapshots; other players send only their inputs.
Three transports share the same code (`src/net.js`), picked automatically:

- **claude.ai**: when the page is published as an Artifact with the `room` capability, anyone the page
  is shared with can join a lobby.
- **server.js**: a small WebSocket relay; everyone connected to the server sees the lobby list.
- **Same device**: without either, lobbies work between browser tabs (BroadcastChannel), handy for testing.

## Controls

| Action | Keyboard + mouse | Touch |
| --- | --- | --- |
| Move | `WASD` / arrows, or right-click the ground | Joystick (left side) |
| Attack | Hold `Space`, or click an enemy | Attack button |
| Skills | Hold `Q` / `E` / `R` to aim at the cursor, release to cast | Drag a skill button to aim, tap to auto-aim |
| Recall | `B` | Home button |
| Regen | `H` | Plus button |
| Battle spell | `F` (hold to aim Blink) | Spell button |
| Shop | `P` | Bag button |
| Scoreboard | `Tab` | List button |
| Mute sound | `M` | Sound button (menu, pause menu or in-game) |

The ultimate unlocks at level 4.

**Regen and battle spells**: every hero has Recall and **Regen**, which restores 35% of your health over
5 seconds, even while you walk (attacking, casting or taking damage from heroes and towers stops it; 25
second cooldown). Before the match you also pick one **battle spell** per hero on the hero select
screen or in the lobby:

| Spell | Cooldown | Effect |
| --- | --- | --- |
| Blink | 100s | Teleport a short distance |
| Smite | 35s | 450 + 40/level true damage to a monster or minion |
| Reap | 90s | True damage to a nearby enemy hero, more the more health they're missing |
| Cleanse | 90s | Break stuns, roots and slows; 1.2 s immunity and a burst of speed |
| Sprint | 90s | 45% move speed for 5 seconds |
| Aegis | 90s | Shield yourself and the most hurt nearby ally |
| Stonegaze | 90s | Stun and damage enemies around you |

**Shop**: press `P` (or the bag button) to buy and sell items anywhere. Items come in three tiers:

- **Tier 3**: basic pieces (Iron Dagger, Arcane Gem, Vital Ruby, Leather Boots...) with one or two attributes.
- **Tier 2**: crafted from 1-2 Tier 3 pieces. Some add a unique attribute, like critical chance or lifesteal.
- **Tier 1**: crafted from 2-3 Tier 2 items. Each has attributes, unique attributes and a unique passive.

Crafting uses up the components you own, and each one takes 80% of its own price off the new item, so
buying piece by piece costs a little more than saving up. A Tier 3 piece crafted into a Tier 2 item is
gone; from then on only the Tier 2 item counts toward the Tier 1 price. Many components feed more than one
Tier 1 item (a Longsword goes into five of them), but each craft consumes its parts, so you buy them again
for the next item. Unique attributes and passives count once even if you own two copies.
Each hero has a recommended build. When you can afford its next piece, a buy prompt appears in the
top-right corner: click **Buy** to confirm (nothing is bought without your click). You can also pin **one**
item in the shop ("Auto-buy when affordable"); it is bought automatically the moment you have the gold.

**Your own builds**: on the hero select screen, in a lobby or from the in-game shop, "Customize build"
opens the full item list. Pick up to six items in the order you want them (one pair of boots); the build is
saved per hero in your browser, and the buy prompt and quick-buy button follow it instead of the recommended
one. It works in multiplayer too: your build travels to the host with your inputs.

## Heroes

| Role | Lane | Heroes |
| --- | --- | --- |
| EXP Lane | Top | Brann (berserker), Sela (spear fighter) |
| Jungle | Jungle | Rook (assassin), Vex (feral hunter) |
| Mid Lane | Mid | Lumen (light mage), Nyx (witch) |
| Gold Lane | Bottom | Kestra (archer), Dax (gunslinger) |
| Roam | Follows a lane | Gorr (tank), Mira (healer) |

Every hero has a passive, two skills and an ultimate. The jungle has buff camps (Azure Wisp, Ember Brute),
small camps, and two river bosses: the Tidewarden (2:00) and the Lord (8:00).

**Bushes** line the lanes and the jungle. A hero inside one is invisible to the enemy team (and can't be
targeted) until an enemy walks into the same bush or the hidden hero deals damage. Area skills still hit.

## Code

- `src/data.js`: map geometry, heroes, items, monsters, tuning
- `src/sim.js`: the authoritative simulation (combat, skills, minions, towers, jungle, rewards)
- `src/ai.js`: role-based bot brains
- `src/art.js`, `src/render.js`: procedural animated characters, terrain and effects
- `src/net.js`: transports, lobby, snapshot encoding
- `src/input.js`, `src/ui.js`, `src/main.js`: controls, screens and HUD, main loop
- `server.js`: static server + WebSocket relay

In the browser console, `lanefall.game` is the live simulation and `lanefall.fast(seconds)` fast-forwards it.
