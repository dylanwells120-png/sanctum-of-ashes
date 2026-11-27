// LAN co-op client. Relative WebSocket URL -> works from any host/subpath served by server/server.js.
export function wsURL() {
  const u = new URL('ws', location.href); u.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'; return u.href;
}
export function probe(timeout = 1500) {
  return new Promise(res => {
    if (location.protocol === 'file:') return res(false);
    let ws; try { ws = new WebSocket(wsURL()); } catch { return res(false); }
    const t = setTimeout(() => { try { ws.close(); } catch {} res(false); }, timeout);
    ws.onopen = () => { clearTimeout(t); ws.send(JSON.stringify({ t: 'probe' })); ws.close(); res(true); };
    ws.onerror = () => { clearTimeout(t); res(false); };
  });
}
export class Net {
  constructor(handlers) { this.h = handlers; this.ws = null; this.open = false; this.closedByUser = false; this.retry = 0; this.id = null;
    this.token = localStorage.getItem('soa_token') || (Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem('soa_token', this.token); }
  connect(hello) {
    this.hello = hello; this.closedByUser = false;
    const ws = new WebSocket(wsURL()); this.ws = ws;
    ws.onopen = () => { this.open = true; this.retry = 0; this.send({ t: 'hello', token: this.token, ...this.hello }); this.h.status?.('connected'); };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (m.t === 'welcome') this.id = m.id; this.h.message?.(m); };
    ws.onclose = () => { this.open = false; if (this.closedByUser) return; this.h.status?.('reconnecting'); const d = Math.min(5000, 600 * 2 ** this.retry++); setTimeout(() => { if (!this.closedByUser) this.connect(this.hello); }, d); };
    ws.onerror = () => {};
  }
  send(m) { if (this.open && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.closedByUser = true; try { this.send({ t: 'leave' }); this.ws?.close(); } catch {} this.open = false; }
}
