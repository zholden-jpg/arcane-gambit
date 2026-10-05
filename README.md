# Arcane Gambit

Story-mode fantasy chess where every chapter twists the rules — plus online duels you can play with a friend over a shared link.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
cd arcane-gambit
npm install      # installs the one dependency (ws)
npm start        # → http://localhost:3000
```

Run the tests with `npm test`.

## Modes

- **Story Mode — *The Shattered Board*.** Eight chapters. You play Wren, the last apprentice of the Order of the Sixty-Four Stars. Each chapter is a battlefield with its own twist. Progress is saved in your browser.
- **Arcane Duel (online).** Pick a battlefield and create a duel. You get a 5-letter code and a link to send to a friend. Players can chat, resign, and ask for a rematch (colors swap). If you refresh or briefly lose connection, you rejoin your seat; it's held for 2 minutes.
- **Local Duel.** Two players on one screen. On fog-of-war boards the screen hides between turns so you can pass the device.

## The chapters

| # | Chapter | Twist |
|---|---------|-------|
| I | The Apprentice's Trial | 6×6 board. No bishops, and pawns can't move two squares. |
| II | The Chasm of Tolm | Chasm squares block movement; enemy Golems leap over them. |
| III | Mistwood | Fog of war, and you win by capturing the king. |
| IV | The Ember Forge | Captures explode (atomic chess). |
| V | The Mirror Gates of Vael | Portals teleport pieces; your Mage and Dragon join you. |
| VI | Siege of Ravenmoor | Survive 20 moves behind your walls. |
| VII | The Salt Road | Promote a pawn to win. |
| VIII | The Hollow Throne | 9×9 boss board with pillars, portals and every fantasy piece. |

## Fantasy pieces

| Piece | Movement |
|-------|----------|
| Mage | Moves like a King or a Knight |
| Dragon | Moves like a Bishop or a Knight |
| Golem | Leaps 1 or 2 squares in a straight line, over anything, including chasms |
| Wraith | Moves up to 3 squares in a straight line, passing through pieces and chasms |

## Playing online with friends

The server hosts both the game and the duels, so your friend has to be able to reach it:

- **Same Wi-Fi:** run `npm start` and find your computer's local IP (on a Mac: System Settings → Wi-Fi → Details, or run `ipconfig getifaddr en0`). Open `http://<that-ip>:3000` yourself, then create the duel. The share link will use that address.
- **Over the internet:** deploy this repo to Render (free). `render.yaml` sets everything up: build `npm install`, start `npm start`, health check `/health`. The free plan sleeps after 15 minutes without players; the game shows a "waking up the duel arena" message while it starts again (up to about a minute).

## Publishing on game portals (with ads)

The game files are hosted by the portal; the duel server runs separately (on Render).
Each portal gets its own build with that portal's SDK and ad calls:

```bash
npm run build -- all wss://arcane-gambit.onrender.com          # every portal
npm run build -- gamedistribution wss://arcane-gambit.onrender.com   # one portal
```

| Target | Upload file | Ads | Saves | Online duels |
|---|---|---|---|---|
| `crazygames` | `dist/arcane-gambit-crazygames.zip` | midgame (after Full Launch) | CrazyGames cloud | invite links + rooms |
| `gamedistribution` | `dist/arcane-gambit-gamedistribution.zip` | showAd | browser | 5-letter code |
| `gamemonetize` | `dist/arcane-gambit-gamemonetize.zip` | showBanner | browser | 5-letter code |
| `y8` | `dist/arcane-gambit-y8.zip` | showAd (`next`) | browser | 5-letter code |
| `gamepix` | `dist/arcane-gambit-gamepix.zip` | interstitialAd | GamePix storage | off (GamePix forbids outside servers) |
| `poki` | `dist/arcane-gambit-poki.zip` | commercialBreak | browser | shareable URLs |
| `playgama` | `dist/arcane-gambit-playgama.zip` | interstitial | Bridge storage | 5-letter code |

Portal IDs go in `portals.config.json` (GameDistribution Game ID, GameMonetize Game ID, Y8 App ID + Game ID).
Ads are spaced at least 90 seconds apart (CrazyGames paces its own), and never in the first minute.

Ads only appear at natural breaks, right after the player clicks something: starting a story chapter, Try again,
Restart, starting/replaying a local duel, and asking for an online rematch. Portals cap how often ads show.

Note: Poki is web-exclusive by default. If Poki accepts the game on an exclusive deal, it has to come off the other web portals.

Test a build locally by serving `dist/` and opening e.g. `http://localhost:8000/crazygames/` (the SDKs run in test mode on localhost).

## Project layout

```
server.js            HTTP server + WebSocket duel rooms (checks every move with the shared engine)
shared/engine.js     Rules engine: board sizes, chasms, portals, fog, explosions, goals, check
shared/rulesets.js   Every battlefield (starting setup + twist flags)
shared/story.js      Chapters: dialogue, opponent, AI strength
shared/ai.js         Alpha-beta AI that follows whatever rules a board has
public/              The browser game (index.html, style.css, js/, fonts/)
public/js/platform.js  Portal SDKs: CrazyGames, GameDistribution, GameMonetize, Y8, GamePix, Poki, Playgama
public/js/config.js  Duel server address (blank = same server)
scripts/             build.mjs — makes the portal upload zips
portals.config.json  Portal IDs used by the build
promo/               Cover art page used to render store images
render.yaml          Render deployment settings
test/                Engine tests (includes perft checks against standard chess)
```

## Extending it

- **New chapter:** add a battlefield to `shared/rulesets.js` (draw the board as text rows) and a chapter entry to `shared/story.js`. To make it playable online too, add its id to `DUEL_ARENAS`.
- **New piece:** add an entry to `PIECES` in `shared/engine.js`. A piece can have `leaps` (jump offsets), `slides` (directions), `range` (how far it can slide) and `phase` (passes through pieces). Then give it an SVG icon in `public/js/board.js`.
- **Difficulty:** each chapter has `ai: { depth, randomness }`. Higher `depth` makes the AI stronger. Higher `randomness` makes it pick weaker moves more often (measured in pawns).

## Known limits

- In fog-of-war duels the server sends the full board to both players and the browser hides it. A player who knows how could read the hidden pieces from the network traffic.
- Pawns always promote to a queen (or to the battlefield's `promoteTo` piece).
- No threefold-repetition or fifty-move rule. Games end in a draw at 200 moves.
