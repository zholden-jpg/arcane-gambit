// WebSocket wrapper for online duels.
// Handles a duel server that is asleep (free hosting): it keeps retrying for ~90s and
// emits 'waking' so the UI can tell the player what's happening.
import { DUEL_SERVER } from './config.js';

export function serverUrls() {
  if (DUEL_SERVER) {
    const ws = DUEL_SERVER.replace(/\/$/, '');
    return { ws, http: ws.replace(/^ws/, 'http') };
  }
  const secure = location.protocol === 'https:';
  return { ws: `${secure ? 'wss' : 'ws'}://${location.host}`, http: `${location.protocol}//${location.host}` };
}

export class Net {
  constructor() {
    this.handlers = {};
    this.queue = [];
    this.ws = null;
    this.attempts = 0;
    this.retryTimer = null;
    this.heartbeat = null;
  }

  /** Fire-and-forget HTTP request that starts waking a sleeping server early. */
  wake() {
    try { fetch(serverUrls().http + '/health', { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch { /* ignore */ }
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    clearTimeout(this.retryTimer);
    let opened = false;
    const ws = new WebSocket(serverUrls().ws);
    this.ws = ws;
    const slow = setTimeout(() => { if (!opened) this.emit('waking'); }, 2500);
    ws.onopen = () => {
      opened = true;
      clearTimeout(slow);
      this.attempts = 0;
      this.queue.splice(0).forEach((m) => ws.send(m));
      clearInterval(this.heartbeat);
      // Regular small messages keep free hosts from putting the server to sleep mid-duel.
      this.heartbeat = setInterval(() => this.send({ type: 'ping' }), 45000);
      this.emit('open');
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.emit(msg.type, msg);
    };
    ws.onclose = () => {
      clearTimeout(slow);
      clearInterval(this.heartbeat);
      if (this.ws !== ws) return;
      if (!opened && this.queue.length && this.attempts < 30) {
        // Server probably still waking up — keep trying.
        this.attempts++;
        this.emit('waking');
        this.retryTimer = setTimeout(() => this.connect(), 3000);
        return;
      }
      if (!opened && this.queue.length) {
        this.queue = [];
        this.attempts = 0;
        this.emit('neterror');
        return;
      }
      this.emit('close');
    };
  }

  send(msg) {
    const data = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === 1) this.ws.send(data);
    else { this.queue.push(data); this.connect(); }
  }

  on(type, fn) { (this.handlers[type] ||= []).push(fn); }
  emit(type, msg) { (this.handlers[type] || []).forEach((fn) => fn(msg)); }

  close() {
    clearTimeout(this.retryTimer);
    clearInterval(this.heartbeat);
    this.queue = [];
    if (this.ws) { const ws = this.ws; this.ws = null; ws.onclose = null; ws.close(); }
  }
}
