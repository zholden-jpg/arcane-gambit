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

## Publishing on CrazyGames

CrazyGames hosts the game files; the duel server runs separately (on Render).

1. Deploy the duel server (above) and note its address, e.g. `https://arcane-gambit.onrender.com`.
2. Build the upload:
   ```bash
   npm run build:crazygames -- wss://arcane-gambit.onrender.com
   ```
   This writes `dist/arcane-gambit-crazygames.zip`. The build uses relative paths, includes the CrazyGames SDK, and points online duels at your server.
3. Upload the zip in the CrazyGames Developer Portal, along with the covers and preview videos from `promo/`.

On CrazyGames the game automatically:
- saves story progress with the CrazyGames data module (cloud saves for signed-in players),
- reports gameplay start/stop and "happy time" on victories,
- uses the player's CrazyGames username in duels (or "Guest"),
- creates CrazyGames invite links, updates room status, and joins duels from invite links or "Instant Multiplayer",
- swaps free-text chat for quick-chat phrases.

Outside CrazyGames (for example with `npm start`) none of that SDK code runs.

Test the CrazyGames build locally by serving `dist/crazygames/` on `localhost` — the SDK runs in its "local" test mode there.

## Project layout

```
server.js            HTTP server + WebSocket duel rooms (checks every move with the shared engine)
shared/engine.js     Rules engine: board sizes, chasms, portals, fog, explosions, goals, check
shared/rulesets.js   Every battlefield (starting setup + twist flags)
shared/story.js      Chapters: dialogue, opponent, AI strength
shared/ai.js         Alpha-beta AI that follows whatever rules a board has
public/              The browser game (index.html, style.css, js/, fonts/)
public/js/platform.js  CrazyGames SDK integration (no-op elsewhere)
public/js/config.js  Duel server address (blank = same server)
scripts/             build-crazygames.mjs — makes the CrazyGames upload zip
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
