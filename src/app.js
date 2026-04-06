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

// ── Boot ──────────────────────────────────────────────────────────────

async function main() {
  Storage.purge();
  _identity = await Crypto.loadOrGenerate();

  UI.initIdentity(_identity.id);
  UI.setPeerStatus('Initialisation...');

  Peer.init(_identity, {
    onReady:      ()           => UI.setPeerStatus('En ligne · prêt', true),
    onIncoming:   peerId       => { _mode = 'direct'; UI.openChat(peerId); UI.renderAll(Storage.load()); },
    onMessage:    ({ text, ttl, isImage }) => {
      const msg = Storage.push(text, false, ttl || CONFIG.TTL.text, isImage);
      UI.renderMessage(msg);
      UI.notifyMessage(text, isImage);
    },
    onScreenshot: ()           => UI.showScreenshotToast(),
    onSecured:    ()           => UI.sysMsg('Connecté ✓ — tu peux écrire.'),
    onDisconnect: ()           => UI.sysMsg('Contact déconnecté. Reconnexion...'),
    onReconnect:  ()           => UI.sysMsg('Reconnecté ✓'),
  });

  await UI.requestNotifPermission();
  _wireIdentityScreen();
  _wireConnectScreen();
  _wireChatScreen();
  _wireGroupScreens();
  _wireQRScanner();
  _wireScreenshots();
}

// ── Screen 1 — Identité ───────────────────────────────────────────────

function _wireIdentityScreen() {
  document.getElementById('btn-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(_identity.id).then(() => {
      const btn = document.getElementById('btn-copy');
      btn.textContent = 'Copié ✓';
      setTimeout(() => btn.textContent = 'Copier mon ID', 2000);
    });
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
        onMessage: ({ text, from, ttl }) => {
          const msg = Storage.push(`[${from}] ${text}`, false, ttl);
          UI.renderMessage(msg);
          UI.notifyMessage(text, false);
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
  const targetId = document.getElementById('peer-id-input').value.trim();
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
      onMessage: ({ text, from, ttl }) => {
        const msg = Storage.push(text, false, ttl);
        UI.renderMessage({ ...msg, from });
        UI.notifyMessage(text, false);
      },
    });
    UI.setConnectStatus('ok', 'Groupe rejoint ✓');
    setTimeout(() => { _mode = 'group'; UI.openGroupChat(token, false); }, 500);
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
      await Groups.send(b64, _identity.id.slice(0, 8));
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
      document.getElementById('peer-id-input').value = result;
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

main().catch(console.error);
