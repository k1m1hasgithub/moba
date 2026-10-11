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
| Scoreboard | `Tab` | List button |

The ultimate unlocks at level 4. Items are bought automatically from each hero's build.

## Heroes

| Role | Lane | Heroes |
| --- | --- | --- |
| EXP Lane | Top | Brann (berserker), Sela (spear fighter) |
| Jungle | Jungle | Rook (assassin), Vex (feral hunter) |
| Mid Lane | Mid | Lumen (light mage), Nyx (witch) |
| Gold Lane | Bottom | Kestra (archer), Dax (gunslinger) |
| Roam | Follows a lane | Gorr (tank), Mira (healer) |

Every hero has a passive, two skills and an ultimate. The jungle has buff camps (Azure Wisp, Ember Brute),
small camps, and two river bosses: the Tidewarden (2:00) and the Elder Wyrm (8:00).

## Code

- `src/data.js`: map geometry, heroes, items, monsters, tuning
- `src/sim.js`: the authoritative simulation (combat, skills, minions, towers, jungle, rewards)
- `src/ai.js`: role-based bot brains
- `src/art.js`, `src/render.js`: procedural animated characters, terrain and effects
- `src/net.js`: transports, lobby, snapshot encoding
- `src/input.js`, `src/ui.js`, `src/main.js`: controls, screens and HUD, main loop
- `server.js`: static server + WebSocket relay

In the browser console, `lanefall.game` is the live simulation and `lanefall.fast(seconds)` fast-forwards it.
