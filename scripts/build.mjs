// Builds a portal upload: a self-contained folder + zip with relative paths, the portal's
// SDK, and the address of your hosted duel server.
//
//   npm run build -- <target> wss://your-duel-server.onrender.com
//   npm run build -- all wss://your-duel-server.onrender.com      (every target)
//
// Targets: crazygames, gamedistribution, gamemonetize, y8, gamepix, poki, playgama
// Portal IDs (from each portal's developer dashboard) live in portals.config.json, or pass
// --gd-game-id=… --gm-game-id=… --y8-app-id=… --y8-game-id=… on the command line.
// Output:  dist/<target>/ (folder) and dist/arcane-gambit-<target>.zip (upload this).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['crazygames', 'gamedistribution', 'gamemonetize', 'y8', 'gamepix', 'poki', 'playgama'];
const OFFLINE_TARGETS = ['gamepix']; // portals that forbid connecting to outside servers

const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [targetArg, serverArg] = args.filter((a) => !a.startsWith('--'));
const server = (serverArg || process.env.DUEL_SERVER || '').trim().replace(/\/$/, '');
const targets = targetArg === 'all' ? TARGETS : [targetArg];

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'portals.config.json'), 'utf8')); } catch { /* optional */ }
const ID = {
  gdGameId: opts['gd-game-id'] || cfg.gamedistribution?.gameId || '',
  gmGameId: opts['gm-game-id'] || cfg.gamemonetize?.gameId || '',
  y8AppId: opts['y8-app-id'] || cfg.y8?.appId || '',
  y8GameId: opts['y8-game-id'] || cfg.y8?.gameId || '',
};
const need = (target, key, label) => {
  if (!ID[key]) console.warn(`  ! ${target}: ${label} is missing — the build works for testing, but add it to portals.config.json before uploading.`);
  return ID[key] || 'MISSING';
};

if (!targets.every((t) => TARGETS.includes(t)) || !/^wss:\/\/[^\s/]+/.test(server)) {
  console.error(`Usage: npm run build -- <${TARGETS.join('|')}|all> wss://your-duel-server.example.com`);
  console.error('(The duel server must use wss:// because portals serve games over https.)');
  process.exit(1);
}

const SDK = {
  crazygames: () => '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
  poki: () => '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>',
  gamedistribution: () => {
    const id = need('gamedistribution', 'gdGameId', 'Game ID');
    return `<script>
    window.GD_OPTIONS = {
      gameId: ${JSON.stringify(id)},
      onEvent: function (event) {
        // SDK_GAME_PAUSE = ad starting (game is paused), SDK_GAME_START = ad over: let the game continue.
        if (window.__agAdEvent) window.__agAdEvent(event.name);
        if (event.name === 'SDK_REWARDED_WATCH_COMPLETE' && window.__agRewardDone) window.__agRewardDone();
      },
    };
    (function (d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s); js.id = id;
      js.src = 'https://html5.api.gamedistribution.com/main.min.js';
      fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'gamedistribution-jssdk'));
  </script>`;
  },
  gamemonetize: () => {
    const id = need('gamemonetize', 'gmGameId', 'Game ID');
    return `<script>
    window.SDK_OPTIONS = {
      gameId: ${JSON.stringify(id)},
      onEvent: function (a) {
        // SDK_GAME_PAUSE = ad starting (game is paused), SDK_GAME_START = ad over: let the game continue.
        if (window.__agAdEvent) window.__agAdEvent(a.name);
      },
    };
    (function (a, b, c) {
      var d = a.getElementsByTagName(b)[0];
      a.getElementById(c) || (a = a.createElement(b), a.id = c, a.src = 'https://api.gamemonetize.com/sdk.js', d.parentNode.insertBefore(a, d));
    })(document, 'script', 'gamemonetize-sdk');
  </script>`;
  },
  y8: () => {
    need('y8', 'y8AppId', 'App ID'); need('y8', 'y8GameId', 'Game ID');
    return '<script src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js" async></script>';
  },
  playgama: () => '<script src="https://bridge.playgama.com/v2/stable/playgama-bridge.js"></script>',
  gamepix: () => '<script src="https://integration.gamepix.com/sdk/v3/gamepix.sdk.js"></script>',
};

for (const target of targets) build(target);

function build(target) {
  const OUT = path.join(ROOT, 'dist', target);
  const ZIP = path.join(ROOT, 'dist', `arcane-gambit-${target}.zip`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
  fs.cpSync(path.join(ROOT, 'shared'), path.join(OUT, 'shared'), { recursive: true });

  // Point online duels at the hosted server.
  const online = !OFFLINE_TARGETS.includes(target);
  fs.writeFileSync(path.join(OUT, 'js', 'config.js'),
    `// Generated by scripts/build.mjs (${target})\nexport const DUEL_SERVER = ${JSON.stringify(online ? server : '')};\n`);

  // Tell the game which portal it is on, and load that portal's SDK before the game script.
  const indexPath = path.join(OUT, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const tag = '<script type="module" src="js/app.js"></script>';
  if (!html.includes(tag)) throw new Error('index.html: game script tag not found');
  const ids = target === 'y8' ? { y8AppId: ID.y8AppId, y8GameId: ID.y8GameId } : {};
  const setup = `<script>window.AG_PLATFORM = ${JSON.stringify(target)}; window.AG_ONLINE = ${online}; window.AG_PLATFORM_IDS = ${JSON.stringify(ids)};</script>`;
  if (target === 'gamepix') {
    // GamePix wants its SDK as the first script in <head>.
    html = html.replace('<head>', `<head>\n  ${SDK[target]()}`).replace(tag, `${setup}\n  ${tag}`);
  } else {
    html = html.replace(tag, `${setup}\n  ${SDK[target]()}\n  ${tag}`);
  }
  fs.writeFileSync(indexPath, html);

  if (target === 'playgama') {
    fs.writeFileSync(path.join(OUT, 'playgama-bridge-config.json'), JSON.stringify({
      advertisement: {
        minimumDelayBetweenInterstitial: 60,
        interstitial: { placementFallback: 'level_completed', placements: [{ id: 'level_completed' }] },
      },
    }, null, 2) + '\n');
  }

  // Sanity check: no absolute paths (portals require relative ones).
  const bad = [];
  for (const f of walk(OUT)) {
    if (!/\.(js|html|css)$/.test(f)) continue;
    const text = fs.readFileSync(f, 'utf8');
    if (/(from|import\(|src=|href=)\s*['"]\/[^/]/.test(text) || /url\(['"]?\/[^/]/.test(text)) bad.push(path.relative(OUT, f));
  }
  if (bad.length) { console.error('Absolute paths found in:', bad.join(', ')); process.exit(1); }

  writeZip(OUT, ZIP);
  const files = walk(OUT);
  const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  console.log(`${target}: ${files.length} files (${(bytes / 1024).toFixed(0)} KB) → ${path.relative(ROOT, ZIP)} (${(fs.statSync(ZIP).size / 1024).toFixed(0)} KB)`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

// Minimal zip writer (deflate), so the build needs no extra dependencies.
function writeZip(dir, out) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const locals = [], centrals = [];
  let offset = 0;
  for (const file of walk(dir).sort()) {
    const name = Buffer.from(path.relative(dir, file).split(path.sep).join('/'));
    const data = fs.readFileSync(file);
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, comp);
    centrals.push(central, name);
    offset += local.length + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(out, Buffer.concat([...locals, cd, end]));
}
