# Lanefall

**A 5v5 MOBA that runs in your browser.** Pick a hero, push three lanes, fight over the river bosses and break the enemy core. Play against bots or with friends, on a computer or a phone.

![A Lanefall match: heroes fighting in the river beside sandstone islands, autumn trees and a bush, with the HUD around the edges](docs/screenshots/match.jpg)

**[Play on claude.ai](https://claude.ai/artifact/W5SQpmvpnDTZJgfx54qh65)** (invite-only) · **[Request access](https://claude.ai/artifact/V3HMr9bwRnFTQDzQ8YCSay)** · **[New player guide](https://claude.ai/artifact/14W4sJeNrLJBvvae57xiGU)**

## Features

- **10 heroes in 5 roles** (EXP, Jungle, Mid, Gold, Roam), each with a passive, two skills and an ultimate.
- **An autumn battlefield:** three lanes with three towers each, jungles of sandstone islands and autumn trees, amber bushes to ambush from, and a river with a boss pool at each end.
- **Item crafting** in three tiers, with your own saved build per hero and a buy prompt that walks you through it.
- **Battle spells:** pick one of seven (Blink, Smite, Reap, Cleanse, Sprint, Aegis, Stonegaze) before each match. Every hero also has Regen and Recall.
- **Bots that play as a team:** they farm, gank, dodge skillshots and fight over bosses. Three difficulty levels.
- **Lobbies for up to 10 players.** Empty seats are filled with bots.
- **No build step, no dependencies.** Plain JavaScript and canvas; everything, including the art, is drawn in code.

## Play

**On claude.ai:** send your claude.ai email from the [request page](https://claude.ai/artifact/V3HMr9bwRnFTQDzQ8YCSay). Once you've been added, sign in and open the [game](https://claude.ai/artifact/W5SQpmvpnDTZJgfx54qh65). The [new player guide](https://claude.ai/artifact/14W4sJeNrLJBvvae57xiGU) shows each step with pictures.

**On your own computer** (needs only [Node.js](https://nodejs.org)):

```sh
git clone https://github.com/k1m1hasgithub/moba.git
cd moba
node server.js        # open http://localhost:8080
```

Use `node server.js 3000` for another port. Host `server.js` on any Node server and everyone who opens the address can play together, no accounts needed.

## How to win

Destroy the enemy **core**. Each lane has three towers (outer, inner and base) that must fall in that order, and the core can't be hurt until a base tower falls.

- **Minions** march down every lane every 25 seconds. Last-hit them for gold.
- **The jungle** has two buff camps (the Azure Wisp for shorter cooldowns, the Ember Brute for burning attacks) and three small camps, tucked between rock islands.
- **The river** has two pools: the **Tidewarden** by the bottom lane from 2:00 (gold for the whole team) and the **Lord** by the top lane from 8:00 (gold and more damage for the whole team).
- **Bushes** hide you from enemies until one of them steps into the same bush or you deal damage.

## Controls

| Action | Keyboard and mouse | Touch |
| --- | --- | --- |
| Move | `W` `A` `S` `D`, or right-click the ground | Joystick |
| Attack | Hold `Space`, or click an enemy | Attack button |
| Skills | Hold `Q` `E` `R` to aim, release to cast | Drag to aim, tap to auto-aim |
| Battle spell | `F` | Spell button |
| Regen · Recall | `H` · `B` | Plus · Home buttons |
| Shop | `P` | Bag button |
| Scoreboard | Hold `Tab` | List button |
| Menu | `Esc` | Menu button |

## Heroes

| Hero | Role | Skills (Q · E · R) |
| --- | --- | --- |
| **Brann** | EXP | Cleave · Charge · Warcry Leap |
| **Sela** | EXP | Spear Thrust · Shieldwall · Whirlwind |
| **Rook** | Jungle | Shadow Dash · Fan of Knives · Execute |
| **Vex** | Jungle | Pounce · Rend · Bloodfrenzy |
| **Lumen** | Mid | Arc Bolt · Radiant Field · Starfall |
| **Nyx** | Mid | Hex Orb · Shade Step · Void Rift |
| **Kestra** | Gold | Piercing Arrow · Tumble · Arrow Storm |
| **Dax** | Gold | Scatter Shot · Overdrive · Deadeye |
| **Gorr** | Roam | Shield Bash · Rallying Roar · Earthquake |
| **Mira** | Roam | Thorn Snare · Bloom · Sanctuary |

The hero screen in the game lists every hero's stats, passive and skill details.

## Items

Basic **Tier 3** pieces craft into **Tier 2** items, which craft into **Tier 1** items with a unique passive. Parts you own are used up and take 80% of their price off the next item.

Nothing is bought automatically. When you can afford the next piece of your build, a prompt appears in the top-right corner. Press **Prioritize** on any item to have the prompt lead to it first, or use **Customize build** to plan your own six items for each hero.

<p>
  <img src="docs/screenshots/heroes.jpg" width="49%" alt="The hero select screen with Kestra selected">
  <img src="docs/screenshots/shop.jpg" width="49%" alt="The shop, showing an item's attributes, unique passive and recipe">
</p>

## Multiplayer

One player creates a lobby and shares its 5-letter code; up to nine others join with it. The host's browser runs the match and streams it to everyone else, and a bot takes over if someone drops out. Lobbies work on claude.ai, through `server.js`, or between tabs on one device.

## Project structure

```
index.html      screens, HUD and menus
style.css       styling, including the phone layout
server.js       file server and multiplayer relay (Node.js, no packages)
src/
  data.js       map, heroes, items, spells and tuning
  sim.js        the game simulation (runs headless in Node.js too)
  ai.js         bots
  art.js        characters, monsters and terrain, drawn in code
  icons.js      item, skill and spell icons
  render.js     camera, world, effects and minimap
  net.js        lobbies and network sync
  input.js      keyboard, mouse and touch
  ui.js         screens, HUD and shop
  main.js       game loop
```
