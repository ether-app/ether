// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Groupes éphémères
//  Architecture : star topology — créateur = hub de relai
//  TTL groupe : 6h
//  Max membres : 10
// ═══════════════════════════════════════════════════════════════════

import CONFIG from './config.js';

const GROUP_TTL = 6 * 60 * 60 * 1000; // 6h
const MAX_MEMBERS = 10;

// ── State ─────────────────────────────────────────────────────────────

let _hubPeer    = null;  // Peer du hub (créateur uniquement)
let _hubConn    = null;  // Connexion vers le hub (membres uniquement)
let _memberConns = new Map(); // peerId → conn (hub uniquement)
let _groupKey   = null;
let _isHub      = false;
let _token      = null;

let _onMessage  = () => {};
let _onMember   = () => {};

// ── Tokens ────────────────────────────────────────────────────────────

function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => chars[b % chars.length]).join('');
}

async function tokenToHubId(token) {
  const buf    = new TextEncoder().encode('ether-group-' + token);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return 'gh-' + Array.from(new Uint8Array(digest))
    .slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Clé de groupe ─────────────────────────────────────────────────────

async function deriveGroupKey(token) {
  const raw     = new TextEncoder().encode(token);
  const keyMat  = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  const salt    = new TextEncoder().encode('ether-group-salt');
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt'],
  );
}

// ── Chiffrement groupe ────────────────────────────────────────────────

async function encryptGroup(text) {
  const iv      = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const cipher  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _groupKey, encoded);
  const out     = new Uint8Array(12 + cipher.byteLength);
  out.set(iv); out.set(new Uint8Array(cipher), 12);
  return btoa(String.fromCharCode(...out));
}

async function decryptGroup(b64) {
  const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const iv   = data.slice(0, 12);
  const enc  = data.slice(12);
  const dec  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _groupKey, enc);
  return new TextDecoder().decode(dec);
}

// ── Créer un groupe ───────────────────────────────────────────────────

async function create(myPeerId, callbacks) {
  _isHub     = true;
  _token     = generateToken();
  _groupKey  = await deriveGroupKey(_token);
  _onMessage = callbacks.onMessage || _onMessage;
  _onMember  = callbacks.onMember  || _onMember;

  const hubId = await tokenToHubId(_token);

  _hubPeer = new Peer(hubId, {
    host:   CONFIG.SIGNAL_HOST,
    port:   CONFIG.SIGNAL_PORT,
    path:   CONFIG.SIGNAL_PATH,
    secure: CONFIG.SIGNAL_SECURE,
  });

  _hubPeer.on('connection', c => {
    if (_memberConns.size >= MAX_MEMBERS) { c.close(); return; }

    _memberConns.set(c.peer, c);
    _onMember(_memberConns.size + 1); // +1 for hub

    c.on('data', async data => {
      if (data.type !== 'gmsg') return;
      try {
        const text = await decryptGroup(data.payload);
        // Relayer à tous les autres membres
        _memberConns.forEach((mc, pid) => {
          if (pid !== c.peer && mc.open) mc.send(data);
        });
        // Notifier l'UI du hub
        _onMessage({ text, from: c.peer.slice(0, 8), ttl: GROUP_TTL });
      } catch { /* ignore */ }
    });

    c.on('close', () => {
      _memberConns.delete(c.peer);
      _onMember(_memberConns.size + 1);
    });
  });

  return _token;
}

// ── Rejoindre un groupe ───────────────────────────────────────────────

async function join(token, myPeer, callbacks) {
  _isHub     = false;
  _token     = token.toUpperCase().trim();
  _groupKey  = await deriveGroupKey(_token);
  _onMessage = callbacks.onMessage || _onMessage;
  _onMember  = callbacks.onMember  || _onMember;

  const hubId = await tokenToHubId(_token);

  return new Promise((resolve, reject) => {
    _hubConn = myPeer.connect(hubId, { reliable: true });
    const timeout = setTimeout(() => reject(new Error('timeout')), 12000);

    _hubConn.on('open', () => {
      clearTimeout(timeout);
      _hubConn.on('data', async data => {
        if (data.type !== 'gmsg') return;
        try {
          const text = await decryptGroup(data.payload);
          _onMessage({ text, from: data.from, ttl: GROUP_TTL });
        } catch { /* ignore */ }
      });
      resolve();
    });

    _hubConn.on('error', err => { clearTimeout(timeout); reject(err); });
  });
}

// ── Envoyer dans le groupe ────────────────────────────────────────────

async function send(text, shortId) {
  const payload = await encryptGroup(text);
  const data    = { type: 'gmsg', payload, from: shortId };

  if (_isHub) {
    // Hub : relayer à tous
    _memberConns.forEach(c => { if (c.open) c.send(data); });
    _onMessage({ text, from: 'moi', ttl: GROUP_TTL });
  } else {
    // Membre : envoyer au hub
    if (_hubConn?.open) _hubConn.send(data);
  }
}

function getToken()      { return _token; }
function getMemberCount(){ return _isHub ? _memberConns.size + 1 : null; }
function isActive()      { return !!_groupKey; }

function destroy() {
  _hubPeer?.destroy();
  _hubConn?.close();
  _memberConns.forEach(c => c.close());
  _memberConns.clear();
  _hubPeer = _hubConn = _groupKey = _token = null;
  _isHub = false;
}

export { create, join, send, getToken, getMemberCount, isActive, destroy, GROUP_TTL };
