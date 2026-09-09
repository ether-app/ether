// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Peer (WebRTC via PeerJS)
//  Transport : WebRTC DataChannel (DTLS natif)
//  E2E applicatif : ECDH P-256 + AES-GCM, clé dérivée par connexion
// ═══════════════════════════════════════════════════════════════════

import CONFIG from './config.js';
import * as Crypto from './crypto.js';

let _peer         = null;
let _conn         = null;
let _sharedKey    = null;
let _identity     = null;
let _lastPeerId   = null;
let _reconnecting = false;

let _onReady      = () => {};
let _onMessage    = () => {};
let _onScreenshot = () => {};
let _onDisconnect = () => {};
let _onIncoming   = () => {};
let _onReconnect  = () => {};
let _onSecured    = () => {};

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
    const c       = _peer.connect(targetId, { reliable: true, serialization: 'json' });
    const timeout = setTimeout(() => reject(new Error('timeout')), 12000);

    c.on('open', () => {
      clearTimeout(timeout);
      _lastPeerId = targetId;
      _wire(c);
      resolve();
    });
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
        attempt(Math.min(delay * 1.5, 30_000), tries + 1);
      }
    }, delay);
  };

  attempt();
}

// ── Câblage connexion ─────────────────────────────────────────────────

function _wire(c) {
  _conn      = c;
  _sharedKey = null;

  c.on('data', async data => {
    if (!data || !data.type) return;

    if (data.type === 'pubkey') {
      // Dérive le secret partagé dès réception de la clé publique du pair
      _sharedKey = await Crypto.deriveSharedKey(_identity.privateKey, data.key);
      _onSecured();
      return;
    }
    if (data.type === 'msg') {
      if (!_sharedKey) return; // message arrivé avant la fin de l'échange de clé
      const text = await Crypto.decrypt(_sharedKey, data.text);
      _onMessage({ text, ttl: data.ttl, isImage: data.isImage || false });
      return;
    }
    if (data.type === 'screenshot') {
      _onScreenshot();
    }
  });

  c.on('close', () => { _conn = null; _sharedKey = null; _onDisconnect(); _tryAutoReconnect(); });
  c.on('error', () => { _conn = null; _sharedKey = null; _onDisconnect(); _tryAutoReconnect(); });

  // Échange de clé publique — condition du chiffrement E2E de la connexion
  const exchangeKey = () => {
    const payload = { type: 'pubkey', key: _identity.pubKeyB64 };
    if (c.open) c.send(payload);
    else        c.on('open', () => c.send(payload));
  };
  exchangeKey();
}

// ── Envoi ─────────────────────────────────────────────────────────────

async function send(text, ttl, isImage = false) {
  if (!_conn?.open) throw new Error('non connecté');
  if (!_sharedKey)  throw new Error('échange de clé en cours');
  const cipher = await Crypto.encrypt(_sharedKey, text);
  _conn.send({ type: 'msg', text: cipher, ttl, isImage });
}

function sendScreenshot() {
  if (_conn?.open) _conn.send({ type: 'screenshot' });
}

function isConnected() { return !!_conn?.open && !!_sharedKey; }
function getPeer()     { return _peer; }

export { init, connect, send, sendScreenshot, isConnected, getPeer };
