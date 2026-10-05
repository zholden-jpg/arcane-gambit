// Platform layer: CrazyGames SDK when available, plain browser otherwise.
// The CrazyGames build (npm run build:crazygames) adds the SDK <script> tag to index.html.
// Without it, every function here quietly falls back to normal browser behaviour.

const sdk = () => (window.CrazyGames && window.CrazyGames.SDK) || null;

export const platform = {
  env: 'browser',      // 'crazygames' | 'local' (CrazyGames SDK test mode) | 'browser'
  isCrazyGames: false, // true for 'crazygames' and 'local'
  user: null,          // { username, profilePictureUrl } when signed in to CrazyGames
};

let playing = false;

export async function initPlatform() {
  const s = sdk();
  if (!s) return platform;
  try {
    await s.init();
    platform.env = s.environment;
    platform.isCrazyGames = s.environment === 'crazygames' || s.environment === 'local';
  } catch (e) {
    console.warn('CrazyGames SDK init failed', e);
    return platform;
  }
  if (platform.isCrazyGames) {
    try { platform.user = await s.user.getUser(); } catch { platform.user = null; }
    try {
      s.user.addAuthListener((user) => { platform.user = user; });
    } catch { /* optional */ }
  }
  return platform;
}

function call(fn) {
  if (!platform.isCrazyGames) return undefined;
  try { return fn(sdk()); } catch (e) { console.warn('CrazyGames SDK call failed', e); return undefined; }
}

// ---- gameplay events (tell CrazyGames when the player is actively playing)
export function setPlaying(active) {
  if (active === playing) return;
  playing = active;
  call((s) => (active ? s.game.gameplayStart() : s.game.gameplayStop()));
}
export const happytime = () => call((s) => s.game.happytime());

// ---- saves: CrazyGames cloud/data module, else localStorage
export const storage = {
  get(key, fallback) {
    let raw = null;
    if (platform.isCrazyGames) raw = call((s) => s.data.getItem(key));
    else { try { raw = localStorage.getItem(key); } catch { raw = null; } }
    if (raw == null) return fallback;
    try { return JSON.parse(raw) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    if (platform.isCrazyGames) call((s) => s.data.setItem(key, raw));
    else { try { localStorage.setItem(key, raw); } catch { /* storage unavailable */ } }
  },
};

// ---- multiplayer rooms & invite links
export const inviteLink = (params) => call((s) => s.game.inviteLink(params)) || null;
export const getInviteParam = (name) => call((s) => s.game.getInviteParam(name)) || null;
export const updateRoom = (roomId, isJoinable) =>
  call((s) => s.game.updateRoom({ roomId, isJoinable, inviteParams: { duel: roomId } }));
export const leftRoom = () => call((s) => s.game.leftRoom());
export const isInstantMultiplayer = () => !!call((s) => s.game.isInstantMultiplayer);
export function onJoinRoom(fn) {
  call((s) => s.game.addJoinRoomListener(fn));
}
