// Platform layer: talks to whichever game portal is hosting the game.
//
// The portal build (npm run build -- <target> ...) sets window.AG_PLATFORM and adds that
// portal's SDK <script>. Supported targets:
//   crazygames        CrazyGames SDK v3      (ads, cloud saves, usernames, invite links, rooms)
//   poki              Poki SDK v2            (ads, shareable invite URLs)
//   gamedistribution  GameDistribution SDK   (ads)
//   playgama          Playgama Bridge        (ads + saves across Playgama's partner sites)
//   gamepix           GamePix SDK v3         (ads + saves; offline modes only — GamePix forbids external requests)
//   gamemonetize      GameMonetize SDK       (ads)
//   y8                Y8 SDK 2.0             (ads)
// Without a target (plain `npm start`), everything falls back to normal browser behaviour.

const target = window.AG_PLATFORM || 'browser';
const ids = window.AG_PLATFORM_IDS || {};

export const platform = {
  target,
  env: 'browser',
  isCrazyGames: false,
  user: null,                // CrazyGames user { username, ... } when signed in
  supportsInviteLinks: true, // false where the portal's page URL can't carry a duel code
  onlineDuels: window.AG_ONLINE !== false, // portals that forbid external servers get a build without online duels
};

let playing = false;
let adapter = null;

// ------------------------------------------------------------------ adapters
const cg = () => window.CrazyGames && window.CrazyGames.SDK;

const adapters = {
  async crazygames() {
    const s = cg();
    if (!s) return null;
    await s.init();
    platform.env = s.environment;
    if (s.environment !== 'crazygames' && s.environment !== 'local') return null;
    platform.isCrazyGames = true;
    try { platform.user = await s.user.getUser(); } catch { platform.user = null; }
    try { s.user.addAuthListener((u) => { platform.user = u; }); } catch { /* optional */ }
    try { s.game.loadingStart(); } catch { /* optional */ }
    return {
      loaded: () => s.game.loadingStop(),
      audioMuted: () => !!(s.game.settings && s.game.settings.muteAudio),
      chatDisabled: () => !!(s.game.settings && s.game.settings.disableChat),
      onSettings: (fn) => s.game.addSettingsChangeListener((st) => fn({ muteAudio: !!(st && st.muteAudio), disableChat: !!(st && st.disableChat) })),
      progress: (pct) => s.game.reportGameCompletedPercentage(pct),
      context: (ctxObj) => s.game.setGameContext(ctxObj),
      gameplay: (on) => (on ? s.game.gameplayStart() : s.game.gameplayStop()),
      happytime: () => s.game.happytime(),
      ad: () => new Promise((resolve) => {
        s.ad.requestAd('midgame', { adStarted() {}, adFinished: resolve, adError: resolve });
      }),
      reward: () => new Promise((resolve) => {
        s.ad.requestAd('rewarded', { adStarted() {}, adFinished: () => resolve(true), adError: () => resolve(false) });
      }),
      get: (k) => s.data.getItem(k),
      set: (k, v) => s.data.setItem(k, v),
      inviteLink: async (params) => s.game.inviteLink(params),
      getInviteParam: (n) => s.game.getInviteParam(n),
      updateRoom: (roomId, isJoinable) => s.game.updateRoom({ roomId, isJoinable, inviteParams: { duel: roomId } }),
      leftRoom: () => s.game.leftRoom(),
      isInstantMultiplayer: () => !!s.game.isInstantMultiplayer,
      onJoinRoom: (fn) => s.game.addJoinRoomListener(fn),
    };
  },

  async poki() {
    const P = window.PokiSDK;
    if (!P) return null;
    try { await P.init(); } catch { /* ad blocker: keep going without ads */ }
    platform.env = 'poki';
    return {
      loaded: () => P.gameLoadingFinished(),
      gameplay: (on) => (on ? P.gameplayStart() : P.gameplayStop()),
      ad: () => P.commercialBreak().catch(() => {}),
      reward: () => P.rewardedBreak().then((ok) => !!ok, () => false),
      inviteLink: (params) => P.shareableURL(params),
      getInviteParam: (n) => P.getURLParam(n),
    };
  },

  async gamedistribution() {
    platform.env = 'gamedistribution';
    platform.supportsInviteLinks = false;
    return {
      ad: () => eventAd(() => {
        const sdk = window.gdsdk;
        if (!sdk || typeof sdk.showAd !== 'function') return false;
        return sdk.showAd();
      }),
      reward: () => new Promise((resolve) => {
        const sdk = window.gdsdk;
        if (!sdk || typeof sdk.showAd !== 'function') return resolve(false);
        let watched = false;
        window.__agRewardDone = () => { watched = true; };
        const finish = (ok) => { window.__agRewardDone = null; resolve(ok); };
        Promise.resolve(sdk.showAd('rewarded')).then(() => setTimeout(() => finish(watched), 300), () => finish(watched));
        setTimeout(() => finish(watched), 90000);
      }),
    };
  },

  async gamemonetize() {
    platform.env = 'gamemonetize';
    platform.supportsInviteLinks = false;
    return {
      ad: () => eventAd(() => {
        const sdk = window.sdk;
        if (!sdk || typeof sdk.showBanner !== 'function') return false;
        sdk.showBanner();
        return true;
      }),
    };
  },

  async y8() {
    // The SDK script loads async: wait for it (up to 8 s), then init with our app + game IDs.
    const y8 = await waitFor(() => window.y8 && typeof window.y8.sdk === 'function' && window.y8, 8000);
    if (!y8) return null;
    const s = y8.sdk();
    try {
      await s.init({ appId: ids.y8AppId, autoLogin: false }, { gameId: ids.y8GameId, preloadAdBreaks: 'auto', sound: 'off' });
    } catch (e) { console.warn('[platform] y8 init', e); }
    platform.env = 'y8';
    platform.supportsInviteLinks = false;
    return {
      ad: () => new Promise((resolve) => {
        try {
          Promise.resolve(s.showAd({
            type: 'next',
            name: 'between-games',
            beforeAd: () => {},
            afterAd: () => {},
            adBreakDone: () => resolve(),
          })).catch(() => resolve());
        } catch { resolve(); }
        setTimeout(resolve, 60000);
      }),
      reward: () => new Promise((resolve) => {
        let ok = false;
        try {
          Promise.resolve(s.showAd({
            type: 'reward',
            name: 'undo-move',
            beforeReward: (showAdFn) => showAdFn(),
            adViewed: () => { ok = true; },
            adDismissed: () => { ok = false; },
            adBreakDone: () => resolve(ok),
          })).catch(() => resolve(false));
        } catch { resolve(false); }
        setTimeout(() => resolve(ok), 90000);
      }),
    };
  },

  async playgama() {
    const b = window.bridge;
    if (!b) return null;
    await b.initialize();
    platform.env = 'playgama:' + (b.platform && b.platform.id);
    platform.supportsInviteLinks = false;
    // Bridge storage is async: preload our keys once so reads can stay synchronous.
    const cache = {};
    try {
      const keys = ['ag-progress', 'ag-name'];
      const vals = await b.storage.get(keys);
      keys.forEach((k, i) => { if (vals && vals[i] != null) cache[k] = typeof vals[i] === 'string' ? vals[i] : JSON.stringify(vals[i]); });
    } catch { /* fall back to empty */ }
    let adDone = null;
    try {
      b.advertisement.on(b.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, (state) => {
        if ((state === 'closed' || state === 'failed') && adDone) { const d = adDone; adDone = null; d(); }
      });
    } catch { /* older bridge */ }
    return {
      loaded: () => b.platform.sendMessage('game_ready'),
      gameplay: (on) => b.platform.sendMessage(on ? 'gameplay_started' : 'gameplay_stopped'),
      ad: () => new Promise((resolve) => {
        adDone = resolve;
        setTimeout(() => { if (adDone === resolve) { adDone = null; resolve(); } }, 45000);
        try { b.advertisement.showInterstitial('level_completed'); } catch { adDone = null; resolve(); }
      }),
      reward: () => new Promise((resolve) => {
        let ok = false;
        const done = (v) => { resolve(v); };
        try {
          b.advertisement.on(b.EVENT_NAME.REWARDED_STATE_CHANGED, (state) => {
            if (state === 'rewarded') ok = true;
            if (state === 'closed' || state === 'failed') done(ok);
          });
          b.advertisement.showRewarded('undo_move');
        } catch { done(false); }
        setTimeout(() => done(ok), 90000);
      }),
      get: (k) => (k in cache ? cache[k] : null),
      set: (k, v) => { cache[k] = v; try { b.storage.set(k, v); } catch { /* ignore */ } },
    };
  },
};

adapters.gamepix = async () => {
  const G = window.GamePix;
  if (!G) return null;
  platform.env = 'gamepix';
  platform.supportsInviteLinks = false;
  // GamePix storage is usable after loaded(); everything is downloaded by now, so report it.
  try { G.loading(100); } catch { /* optional */ }
  try { await Promise.race([Promise.resolve(G.loaded()), new Promise((r) => setTimeout(r, 5000))]); } catch { /* keep going */ }
  return {
    happytime: () => G.happyMoment(),
    ad: () => Promise.race([Promise.resolve(G.interstitialAd()), new Promise((r) => setTimeout(r, 60000))]).catch(() => {}),
    reward: () => Promise.race([Promise.resolve(G.rewardAd()), new Promise((r) => setTimeout(() => r({ success: false }), 90000))])
      .then((res) => !!(res && res.success), () => false),
    get: (k) => G.localStorage.getItem(k),
    set: (k, v) => G.localStorage.setItem(k, v),
  };
};

/** Resolve when check() returns something truthy (or with null after `ms`). */
function waitFor(check, ms) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    (function poll() {
      let v = null;
      try { v = check(); } catch { v = null; }
      if (v) return resolve(v);
      if (Date.now() - t0 > ms) return resolve(null);
      setTimeout(poll, 100);
    })();
  });
}

/**
 * Ads for SDKs that report through SDK_GAME_PAUSE / SDK_GAME_START events
 * (GameDistribution, GameMonetize). The build wires those events to window.__agAdEvent.
 * If no ad starts within a few seconds (frequency cap, ad blocker, no fill), carry on.
 */
function eventAd(show) {
  return new Promise((resolve) => {
    let started = false;
    const done = () => { window.__agAdEvent = null; resolve(); };
    window.__agAdEvent = (name) => {
      if (name === 'SDK_GAME_PAUSE') started = true;
      if (name === 'SDK_GAME_START' && started) done();
    };
    let r;
    try { r = show(); } catch { r = false; }
    if (r === false) return done();
    if (r && typeof r.then === 'function') r.then(() => setTimeout(done, 300), done);
    setTimeout(() => { if (!started) done(); }, 3500);
    setTimeout(done, 60000);
  });
}

export async function initPlatform() {
  const make = adapters[target];
  if (!make) return platform;
  try {
    adapter = await make();
  } catch (e) {
    console.warn(`[platform] ${target} init failed`, e);
    adapter = null;
  }
  return platform;
}

function call(name, ...args) {
  if (!adapter || typeof adapter[name] !== 'function') return undefined;
  try { return adapter[name](...args); } catch (e) { console.warn(`[platform] ${name} failed`, e); return undefined; }
}

/** Call once the game is ready to play (hides portal loading screens). */
export const gameLoaded = () => call('loaded');

/** Tell the portal whether the player is actively in a match. */
export function setPlaying(active) {
  if (active === playing) return;
  playing = active;
  call('gameplay', active);
}

export const happytime = () => call('happytime');

/** Portal-level mute (e.g. CrazyGames "mute audio" setting). */
export const portalMuted = () => !!call('audioMuted');
export const onPortalSettings = (fn) => call('onSettings', fn);
/** Portal-level "disable chat" setting (CrazyGames). */
export const portalChatDisabled = () => !!call('chatDisabled');
/** Overall game completion, 0–100 (story progress). */
export const reportProgress = (pct) => call('progress', Math.max(0, Math.min(100, Math.round(pct))));
/** Context attached to player feedback reports (which mode/chapter they were in). */
export const setGameContext = (obj) => call('context', obj);

const adHooks = [];
/** fn(true) when an ad starts, fn(false) when it ends — used to mute game audio. */
export const onAd = (fn) => adHooks.push(fn);
let adBusy = false;
let lastAd = Date.now(); // no ad in the first minute after loading
const AD_GAP_MS = 60 * 1000;
let lastAdWasStartup = true; // the first break can come 60 s after load
/**
 * Show a between-games ad if the portal offers one. Always resolves (ad finished,
 * failed, blocked or not available). Portals cap the frequency themselves.
 * Only call this at natural breaks, right after a player clicks a button.
 */
export async function breakAd() {
  if (!adapter || !adapter.ad || adBusy) return;
  // CrazyGames paces its own ads; for the others, keep at least 60 s between breaks (and none in the first 45 s).
  if (target !== 'crazygames' && Date.now() - lastAd < AD_GAP_MS - 15000 * (lastAdWasStartup ? 1 : 0)) return;
  adBusy = true;
  setPlaying(false);
  document.body.classList.add('ad-playing');
  adHooks.forEach((h) => h(true));
  try { await Promise.race([adapter.ad(), new Promise((r) => setTimeout(r, 60000))]); } catch { /* ignore */ }
  document.body.classList.remove('ad-playing');
  adHooks.forEach((h) => h(false));
  lastAd = Date.now();
  lastAdWasStartup = false;
  adBusy = false;
}

/** True when this portal offers rewarded ads (the game falls back to free rewards otherwise). */
export const rewardAvailable = () => !!(adapter && adapter.reward);

/**
 * Optional rewarded ad the player chose to watch. Resolves true only if the ad was fully watched.
 * Not subject to the between-games cooldown (the player asked for it).
 */
export async function rewardAd() {
  if (!adapter || !adapter.reward || adBusy) return false;
  adBusy = true;
  setPlaying(false);
  document.body.classList.add('ad-playing');
  adHooks.forEach((h) => h(true));
  let ok = false;
  try { ok = await Promise.race([adapter.reward(), new Promise((r) => setTimeout(() => r(false), 95000))]); } catch { ok = false; }
  document.body.classList.remove('ad-playing');
  adHooks.forEach((h) => h(false));
  lastAd = Date.now(); // no interstitial straight after a rewarded ad
  lastAdWasStartup = false;
  adBusy = false;
  return !!ok;
}

// ---- saves: portal storage when available, else localStorage
export const storage = {
  get(key, fallback) {
    let raw = null;
    if (adapter && adapter.get) raw = call('get', key);
    else { try { raw = localStorage.getItem(key); } catch { raw = null; } }
    if (raw == null) return fallback;
    try { return JSON.parse(raw) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    if (adapter && adapter.set) call('set', key, raw);
    else { try { localStorage.setItem(key, raw); } catch { /* storage unavailable */ } }
  },
};

// ---- multiplayer invites & rooms
/** Returns a portal invite URL (string) or null. May be async on some portals. */
export async function inviteLink(params) {
  try { return (await call('inviteLink', params)) || null; } catch { return null; }
}
export const getInviteParam = (name) => call('getInviteParam', name) || null;
export const updateRoom = (roomId, isJoinable) => call('updateRoom', roomId, isJoinable);
export const leftRoom = () => call('leftRoom');
export const isInstantMultiplayer = () => !!call('isInstantMultiplayer');
export const onJoinRoom = (fn) => call('onJoinRoom', fn);
