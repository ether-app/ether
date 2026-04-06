// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Peer (WebRTC via PeerJS)
//  Gère la connexion P2P + handshake crypto + chiffrement applicatif
// ═══════════════════════════════════════════════════════════════════

import CONFIG  from './config.js';
import * as Crypto from './crypto.js';

let _peer       = null;
let _conn       = null;
let _sharedKey  = null;
let _identity   = null;

// Callbacks
let _onReady      = () => {};
let _onMessage    = () => {};
let _onScreenshot = () => {};
let _onDisconnect = () => {};
let _onIncoming   = () => {};

// ── Init ─────────────────────────────────────────────────────────────

function init(identity, { onReady, onMessage, onScreenshot, onDisconnect, onIncoming }) {
  _identity     = identity;
  _onReady      = onReady      || _onReady;
  _onMessage    = onMessage    || _onMessage;
  _onScreenshot = onScreenshot || _onScreenshot;
  _onDisconnect = onDisconnect || _onDisconnect;
  _onIncoming   = onIncoming   || _onIncoming;

  _peer = new Peer(identity.id, {
    host:   CONFIG.SIGNAL_HOST,
    port:   CONFIG.SIGNAL_PORT,
    path:   CONFIG.SIGNAL_PATH,
    secure: CONFIG.SIGNAL_SECURE,
    debug:  0,
  });

  _peer.on('open', () => _onReady());

  _peer.on('connection', c => {
    _wire(c);
    _onIncoming(c.peer);
  });

  _peer.on('error', err => {
    if (err.type === 'unavailable-id') location.reload(); // ID pris → régénérer
    console.error('[peer]', err.type, err.message);
  });

  _peer.on('disconnected', () => {
    setTimeout(() => _peer?.reconnect(), 2000);
  });
}

// ── Connexion sortante ───────────────────────────────────────────────

function connect(targetId) {
  return new Promise((resolve, reject) => {
    const c = _peer.connect(targetId, { reliable: true });

    const timeout = setTimeout(() => reject(new Error('timeout')), 12000);

    c.on('open', () => {
      clearTimeout(timeout);
      _wire(c);
      resolve();
    });

    c.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ── Câblage d'une connexion (entrante ou sortante) ───────────────────

function _wire(c) {
  _conn = c;

  // Envoi de notre clé publique dès l'ouverture (handshake)
  c.on('open', () => {
    c.send({ type: 'handshake', pubKey: _identity.pubKeyB64 });
  });

  c.on('data', async data => {
    if (data.type === 'handshake') {
      // Dérivation du secret partagé
      _sharedKey = await Crypto.deriveSharedKey(_identity.privateKey, data.pubKey);
      return;
    }

    if (data.type === 'msg') {
      if (!_sharedKey) return; // pas encore de clé
      try {
        const plain = await Crypto.decrypt(_sharedKey, data.payload);
        _onMessage({ text: plain, ttl: data.ttl });
      } catch {
        console.warn('[peer] déchiffrement échoué');
      }
      return;
    }

    if (data.type === 'screenshot') {
      _onScreenshot();
    }
  });

  c.on('close',   () => { _sharedKey = null; _onDisconnect(); });
  c.on('error',   () => { _sharedKey = null; _onDisconnect(); });
}

// ── Envoi d'un message chiffré ───────────────────────────────────────

async function send(text, ttl) {
  if (!_conn?.open)  throw new Error('non connecté');
  if (!_sharedKey)   throw new Error('handshake non terminé');

  const payload = await Crypto.encrypt(_sharedKey, text);
  _conn.send({ type: 'msg', payload, ttl });
}

// ── Notification screenshot ──────────────────────────────────────────

function sendScreenshot() {
  if (_conn?.open) _conn.send({ type: 'screenshot' });
}

function isConnected() {
  return !!(_conn?.open && _sharedKey);
}

export { init, connect, send, sendScreenshot, isConnected };
