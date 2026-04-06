// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Storage éphémère
//  Messages en localStorage avec TTL — auto-purge à chaque accès.
// ═══════════════════════════════════════════════════════════════════

const KEY = 'ether_messages';

function load() {
  const now  = Date.now();
  const all  = JSON.parse(localStorage.getItem(KEY) || '[]');
  const live = all.filter(m => m.expires > now);
  if (live.length !== all.length) _save(live); // purge
  return live;
}

function push(text, mine, ttl) {
  const msgs = load();
  const msg  = {
    id:      crypto.randomUUID(),
    text,
    mine,
    ts:      Date.now(),
    expires: Date.now() + ttl,
    ttl,
  };
  msgs.push(msg);
  _save(msgs);
  return msg;
}

function purge() {
  load(); // déclenche la purge automatique
}

function _save(msgs) {
  localStorage.setItem(KEY, JSON.stringify(msgs));
}

export { load, push, purge };
