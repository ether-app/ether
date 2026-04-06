// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Storage éphémère
// ═══════════════════════════════════════════════════════════════════

const KEY = 'ether_messages';

export function load() {
  const now  = Date.now();
  const all  = JSON.parse(localStorage.getItem(KEY) || '[]');
  const live = all.filter(m => m.expires > now);
  if (live.length !== all.length) _save(live);
  return live;
}

export function push(text, mine, ttl, isImage = false) {
  const msgs = load();
  const msg  = { id: crypto.randomUUID(), text, mine, isImage, ts: Date.now(), expires: Date.now() + ttl, ttl };
  msgs.push(msg);
  _save(msgs);
  return msg;
}

export function purge() { load(); }

function _save(msgs) { localStorage.setItem(KEY, JSON.stringify(msgs)); }
