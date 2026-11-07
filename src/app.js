// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — App v1.1
// ═══════════════════════════════════════════════════════════════════

import CONFIG       from './config.js';
import * as Crypto  from './crypto.js';
import * as Storage from './storage.js';
import * as Peer    from './peer.js';
import * as UI      from './ui.js';
import * as Groups  from './groups.js';

let _identity = null;
let _mode     = 'direct'; // 'direct' | 'group'
let _currentPeer = null, _currentCode = null;
const _verified  = new Map(); // peerId → code confirmé (mémoire de session uniquement)

// Lien d'invitation : app.html#c=<id>. Le fragment (#) n'est jamais envoyé au serveur.
function _inviteLink(id) { return location.origin + location.pathname + '#c=' + id; }
function _idFrom(text) {
  const t = (text || '').trim();
  const m = t.match(/#c=(e-[0-9a-f]{20})$/);
  if (m) return m[1];
  return t; // ID collé tel quel
}
let _pendingInvite = (() => {
  const m = location.hash.match(/^#c=(e-[0-9a-f]{20})$/);
  if (location.hash) history.replaceState(null, '', location.pathname);
  return m ? m[1] : null;
})();

// ── Boot ──────────────────────────────────────────────────────────────

async function main() {
  Storage.purge();
  _identity = await Crypto.loadOrGenerate();

  UI.initIdentity(_identity.id, _inviteLink(_identity.id));
  UI.setPeerStatus('Initialisation...');

  Peer.init(_identity, {
    onReady:      ()           => {
      UI.setPeerStatus('En ligne · prêt', true);
      if (_pendingInvite && _pendingInvite !== _identity.id) {
        const target = _pendingInvite; _pendingInvite = null;
        document.getElementById('tab-direct').click();
        UI.showScreen('screen-connect');
        document.getElementById('peer-id-input').value = target;
        _doConnect();
      }
    },
    onIncoming:   peerId       => { _mode = 'direct'; UI.hideSafetyCode(); UI.openChat(peerId); UI.renderAll(Storage.load()); },
    onMessage:    ({ text, ttl, isImage }) => {
      const msg = Storage.push(text, false, ttl || CONFIG.TTL.text, isImage);
      UI.renderMessage(msg);
      UI.notifyMessage(text, isImage);
    },
    onScreenshot: ()           => UI.showScreenshotToast(),
    onSecured:    ({ peerId, code }) => {
      UI.sysMsg('Connecté ✓ — tu peux écrire.');
      UI.showSafetyCode(code, _verified.get(peerId) === code);
      _currentPeer = peerId; _currentCode = code;
    },
    onAlert:      text         => { UI.hideSafetyCode(); UI.sysMsg('⚠ ' + text); UI.alertToast(text); },
    onDisconnect: ()           => UI.sysMsg('Contact déconnecté. Reconnexion...'),
    onReconnect:  ()           => UI.sysMsg('Reconnecté ✓'),
  });

  // Ne pas attendre la réponse à la demande de notifications : tant qu'elle
  // reste sans réponse, aucun bouton ne serait branché.
  UI.requestNotifPermission();
  _wireIdentityScreen();
  _wireConnectScreen();
  _wireChatScreen();
  _wireGroupScreens();
  _wireQRScanner();
  _wireScreenshots();
}

// ── Screen 1 — Identité ───────────────────────────────────────────────

function _wireIdentityScreen() {
  document.getElementById('btn-copy').addEventListener('click', async () => {
    const url = _inviteLink(_identity.id);
    const btn = document.getElementById('btn-copy');
    if (navigator.share) {
      try { await navigator.share({ title: 'ÉTHER', text: 'Parlons sur ÉTHER (chiffré, éphémère) :', url }); return; }
      catch (e) { if (e?.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Lien copié ✓';
    } catch { btn.textContent = 'Copie impossible'; }
    setTimeout(() => btn.textContent = 'Partager mon lien', 2000);
  });

  document.getElementById('btn-go-connect').addEventListener('click', () => {
    document.getElementById('tab-direct').click();
    UI.showScreen('screen-connect');
  });
}

// ── Screen 2 — Connexion ──────────────────────────────────────────────

function _wireConnectScreen() {
  document.getElementById('btn-back').addEventListener('click', () => UI.showScreen('screen-identity'));

  // Onglets Direct | Groupe
  document.getElementById('tab-direct').addEventListener('click', () => _switchTab('direct'));
  document.getElementById('tab-group').addEventListener('click',  () => _switchTab('group'));

  // Direct — connecter
  document.getElementById('btn-do-connect').addEventListener('click', _doConnect);
  document.getElementById('peer-id-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') _doConnect();
  });

  // Groupe — créer
  document.getElementById('btn-create-group').addEventListener('click', async () => {
    document.getElementById('btn-create-group').disabled = true;
    UI.setConnectStatus('', 'Création du groupe...');
    try {
      const token = await Groups.create(_identity.id, {
        onMessage: ({ text, from, ttl, isImage }) => {
          const msg = Storage.push(text, false, ttl, isImage);
          UI.renderMessage({ ...msg, from });
          UI.notifyMessage(text, isImage);
        },
        onMember: n => UI.setGroupMemberCount(n),
      });
      UI.showGroupCreate(token);
    } catch (err) {
      UI.setConnectStatus('err', 'Erreur création : ' + err.message);
      document.getElementById('btn-create-group').disabled = false;
    }
  });

  // Groupe — rejoindre
  document.getElementById('btn-join-group').addEventListener('click', _doJoinGroup);
  document.getElementById('group-token-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') _doJoinGroup();
  });
}

function _switchTab(tab) {
  _mode = tab;
  document.getElementById('tab-direct').classList.toggle('active', tab === 'direct');
  document.getElementById('tab-group').classList.toggle('active',  tab === 'group');
  document.getElementById('panel-direct').classList.toggle('active', tab === 'direct');
  document.getElementById('panel-group').classList.toggle('active',  tab === 'group');
  UI.setConnectStatus('', '');
}

async function _doConnect() {
  const targetId = _idFrom(document.getElementById('peer-id-input').value);
  if (!targetId || targetId === _identity.id) {
    UI.setConnectStatus('err', targetId === _identity.id ? 'C\'est ton propre ID.' : 'Colle un ID valide.');
    return;
  }
  UI.setConnectBtnDisabled(true);
  UI.setConnectStatus('', 'Connexion...');
  try {
    await Peer.connect(targetId);
    UI.setConnectStatus('ok', 'Connecté ✓');
    setTimeout(() => { _mode = 'direct'; UI.openChat(targetId); UI.renderAll(Storage.load()); }, 500);
  } catch {
    UI.setConnectStatus('err', 'Introuvable — vérifie l\'ID.');
    UI.setConnectBtnDisabled(false);
  }
}

async function _doJoinGroup() {
  const token = document.getElementById('group-token-input').value.trim().toUpperCase();
  if (token.length < 4) { UI.setConnectStatus('err', 'Token invalide.'); return; }

  document.getElementById('btn-join-group').disabled = true;
  UI.setConnectStatus('', 'Connexion au groupe...');

  try {
    await Groups.join(token, Peer.getPeer(), {
      onMessage: ({ text, from, ttl, isImage }) => {
        const msg = Storage.push(text, false, ttl, isImage);
        UI.renderMessage({ ...msg, from });
        UI.notifyMessage(text, isImage);
      },
    });
    UI.setConnectStatus('ok', 'Groupe rejoint ✓');
    setTimeout(() => { _mode = 'group'; UI.hideSafetyCode(); UI.openGroupChat(token, false); }, 500);
  } catch {
    UI.setConnectStatus('err', 'Groupe introuvable ou expiré.');
    document.getElementById('btn-join-group').disabled = false;
  }
}

// ── Screen 3 — Chat ───────────────────────────────────────────────────

function _wireChatScreen() {
  document.getElementById('btn-send').addEventListener('click', _sendMsg);
  document.getElementById('msg-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMsg(); }
  });

  // Bouton photo
  document.getElementById('btn-photo').addEventListener('click', () => {
    document.getElementById('photo-input').click();
  });
  document.getElementById('photo-input').addEventListener('change', _sendPhoto);

  // Code de sécurité
  document.getElementById('btn-safety-same').addEventListener('click', () => {
    if (_currentPeer) _verified.set(_currentPeer, _currentCode);
    UI.showSafetyCode(_currentCode, true);
  });
  document.getElementById('btn-safety-diff').addEventListener('click', () => {
    Peer.disconnect();
    UI.hideSafetyCode();
    UI.alertToast('Codes différents : connexion coupée. Reconnectez-vous en scannant le QR code en personne.');
    UI.sysMsg('⚠ Connexion coupée — codes de sécurité différents.');
  });
  document.getElementById('btn-safety-toggle').addEventListener('click', UI.toggleSafetyDetail);
}

async function _sendMsg() {
  const input = document.getElementById('msg-input');
  const text  = input.value.trim();
  if (!text) return;

  if (_mode === 'group') {
    if (!Groups.isActive()) { UI.sysMsg('Plus dans un groupe.'); return; }
    try {
      await Groups.send(text, _identity.id.slice(0, 8));
      const msg = Storage.push(text, true, CONFIG.TTL.group);
      UI.renderMessage(msg);
      input.value = '';
    } catch (err) { UI.sysMsg('Erreur : ' + err.message); }
    return;
  }

  if (!Peer.isConnected()) { UI.sysMsg('Connexion en cours, patiente 2 secondes...'); return; }
  try {
    await Peer.send(text, CONFIG.TTL.text);
    const msg = Storage.push(text, true, CONFIG.TTL.text);
    UI.renderMessage(msg);
    input.value = '';
  } catch (err) { UI.sysMsg('Erreur : ' + err.message); }
}

async function _sendPhoto() {
  const file = document.getElementById('photo-input').files[0];
  if (!file) return;
  document.getElementById('photo-input').value = '';

  UI.sysMsg('Compression et envoi...');
  try {
    const b64 = await Crypto.compressImage(file, CONFIG.PHOTO_MAX_PX, CONFIG.PHOTO_QUALITY);
    if (_mode === 'group') {
      await Groups.send(b64, _identity.id.slice(0, 8), true);
    } else {
      if (!Peer.isConnected()) { UI.sysMsg('Connexion en cours, patiente 2 secondes...'); return; }
      await Peer.send(b64, CONFIG.TTL.image, true);
    }
    const msg = Storage.push(b64, true, CONFIG.TTL.image, true);
    UI.renderMessage(msg);
  } catch (err) { UI.sysMsg('Photo échouée : ' + err.message); }
}

// ── Screen 4 — Groupe créé ────────────────────────────────────────────

function _wireGroupScreens() {
  document.getElementById('btn-group-copy-token').addEventListener('click', () => {
    navigator.clipboard.writeText(Groups.getToken()).then(() => {
      const btn = document.getElementById('btn-group-copy-token');
      btn.textContent = 'Copié ✓';
      setTimeout(() => btn.textContent = 'Copier le token', 2000);
    });
  });

  document.getElementById('btn-group-open-chat').addEventListener('click', () => {
    _mode = 'group';
    UI.openGroupChat(Groups.getToken(), true);
  });
}

// ── QR Scanner ────────────────────────────────────────────────────────

function _wireQRScanner() {
  document.getElementById('btn-scan-qr').addEventListener('click', () => {
    UI.openQRScanner(result => {
      document.getElementById('peer-id-input').value = _idFrom(result);
      _doConnect();
    });
  });

  document.getElementById('btn-close-scanner').addEventListener('click', UI.closeQRScanner);
}

// ── Détection screenshot ──────────────────────────────────────────────

function _wireScreenshots() {
  document.addEventListener('keydown', e => {
    const snap =
      (e.metaKey && e.shiftKey && ['3','4','5'].includes(e.key)) ||
      e.key === 'PrintScreen';
    if (snap) Peer.sendScreenshot();
  });
}

main().catch(err => {
  console.error('[ÉTHER] init failed:', err);
  document.body.innerHTML = `<div style="color:#ef4444;padding:40px;font-family:monospace;font-size:14px">
    Erreur de démarrage.<br><br>${err.message}<br><br>
    <button onclick="location.reload()" style="padding:10px 20px;background:#7c6af7;border:none;color:#fff;border-radius:8px;cursor:pointer">
      Recharger
    </button>
  </div>`;
});
