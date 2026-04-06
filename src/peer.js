// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Peer (WebRTC via PeerJS)
//  Gère la connexion P2P 1-1 + handshake crypto + reconnexion auto
// ═══════════════════════════════════════════════════════════════════

import CONFIG        from './config.js';
import * as Crypto   from './crypto.js';

let _peer         = null;
let _conn         = null;
let _sharedKey    = null;
let _identity     = null;
let _lastPeerId   = null;  // pour reconnexion auto
let _reconnecting = false;

let _onReady      = () => {};
let _onMessage    = () => {};
let _onScreenshot = () => {};
let _onDisconnect = () => {};
let _onIncoming   = () => {};
let _onReconnect  = () => {};
let _onSecured    = () => {}; // handshake terminé → prêt à envoyer

// ── Init ──────────────────────────────────────────────────────────────

function init(identity, cbs) {
  _identity     = identity;
  _onReady      = cbs.onReady      || _onReady;
  _onMessage    = cbs.onMessage    || _onMessage;
  _onScreenshot = cbs.onScreenshot || _onScreenshot;
  _onDisconnect = cbs.onDisconnect || _onDisconnect;
  _onIncoming   = cbs.onIncoming   || _onIncoming;
  _onReconnect  = cbs.onReconnect  || _onReconnect;
  _onSecured    = cbs.onSecured    || _onSecured;

  _boot();
}

function _boot() {
  _peer = new Peer(_identity.id, {
    host:   CONFIG.SIGNAL_HOST,
    port:   CONFIG.SIGNAL_PORT,
    path:   CONFIG.SIGNAL_PATH,
    secure: CONFIG.SIGNAL_SECURE,
    debug:  0,
  });

  _peer.on('open',        () => { _onReady(); _tryAutoReconnect(); });
  _peer.on('connection',  c  => { _wire(c); _onIncoming(c.peer); });
  _peer.on('error',       err => {
    if (err.type === 'unavailable-id') { location.reload(); return; }
    console.warn('[peer]', err.type);
  });
  _peer.on('disconnected', () => {
    setTimeout(() => { if (!_peer.destroyed) _peer.reconnect(); }, 2000);
  });
}

// ── Connexion sortante ────────────────────────────────────────────────

function connect(targetId) {
  return new Promise((resolve, reject) => {
    const c       = _peer.connect(targetId, { reliable: true });
    const timeout = setTimeout(() => reject(new Error('timeout')), 12000);

    c.on('open',  () => { clearTimeout(timeout); _wire(c); _lastPeerId = targetId; resolve(); });
    c.on('error', err => { clearTimeout(timeout); reject(err); });
  });
}

// ── Reconnexion auto ──────────────────────────────────────────────────

function _tryAutoReconnect() {
  if (!_lastPeerId || _reconnecting || isConnected()) return;
  _reconnecting = true;

  const attempt = (delay = 2000, tries = 0) => {
    if (isConnected() || tries > 5) { _reconnecting = false; return; }
    setTimeout(async () => {
      try {
        await connect(_lastPeerId);
        _reconnecting = false;
        _onReconnect();
      } catch {
        attempt(Math.min(delay * 1.5, 30000), tries + 1);
      }
    }, delay);
  };

  attempt();
}

// ── Câblage connexion ─────────────────────────────────────────────────

function _wire(c) {
  _conn = c;
  _sharedKey = null;

  // 1. Écouter les données EN PREMIER (évite la race condition)
  c.on('data', async data => {
    if (data.type === 'handshake') {
      _sharedKey = await Crypto.deriveSharedKey(_identity.privateKey, data.pubKey);
      _onSecured(); // connexion chiffrée et prête
      return;
    }
    if (data.type === 'msg' && _sharedKey) {
      try {
        const text = await Crypto.decrypt(_sharedKey, data.payload);
        _onMessage({ text, ttl: data.ttl, isImage: data.isImage || false });
      } catch { console.warn('[peer] déchiffrement échoué'); }
      return;
    }
    if (data.type === 'screenshot') _onScreenshot();
  });

  c.on('close', () => { _sharedKey = null; _onDisconnect(); _tryAutoReconnect(); });
  c.on('error', () => { _sharedKey = null; _onDisconnect(); _tryAutoReconnect(); });

  // 2. Envoyer le handshake APRÈS avoir posé le listener
  const sendHandshake = () => c.send({ type: 'handshake', pubKey: _identity.pubKeyB64 });
  if (c.open) { sendHandshake(); } else { c.on('open', sendHandshake); }
}

// ── Envoi ─────────────────────────────────────────────────────────────

async function send(text, ttl, isImage = false) {
  if (!_conn?.open)  throw new Error('non connecté');
  if (!_sharedKey)   throw new Error('handshake non terminé');
  const payload = await Crypto.encrypt(_sharedKey, text);
  _conn.send({ type: 'msg', payload, ttl, isImage });
}

function sendScreenshot() {
  if (_conn?.open) _conn.send({ type: 'screenshot' });
}

function isConnected() { return !!(_conn?.open && _sharedKey); }
function getPeer()     { return _peer; }

export { init, connect, send, sendScreenshot, isConnected, getPeer };
