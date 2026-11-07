// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Storage éphémère
//  Mode normal    : localStorage, purge à l'expiration (TTL)
//  Mode sans trace: mémoire uniquement, tout disparaît à la fermeture
// ═══════════════════════════════════════════════════════════════════

const KEY = 'ether_messages';
let _memory = null; // tableau en mémoire quand le mode sans trace est actif

export function setEphemeral(on) {
  _memory = on ? [] : null;
  if (on) { try { localStorage.removeItem(KEY); } catch {} }
}

export function load() {
  const now  = Date.now();
  const all  = _memory ?? JSON.parse(localStorage.getItem(KEY) || '[]');
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

function _save(msgs) {
  if (_memory) { _memory.length = 0; _memory.push(...msgs); return; }
  localStorage.setItem(KEY, JSON.stringify(msgs));
}
