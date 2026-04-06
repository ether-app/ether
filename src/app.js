// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — App (orchestrateur principal)
// ═══════════════════════════════════════════════════════════════════

import CONFIG        from './config.js';
import * as Crypto   from './crypto.js';
import * as Storage  from './storage.js';
import * as Peer     from './peer.js';
import * as UI       from './ui.js';

// ── Démarrage ────────────────────────────────────────────────────────

async function main() {
  Storage.purge();

  // 1. Identité
  const identity = await Crypto.loadOrGenerate();

  // 2. UI — écran identité
  UI.initIdentity(identity.id, identity.pubKeyB64);
  UI.setPeerStatus('Initialisation...');

  // 3. PeerJS
  Peer.init(identity, {
    onReady:      () => UI.setPeerStatus('En ligne · prêt', true),
    onIncoming:   peerId => { UI.openChat(peerId); UI.renderAll(Storage.load()); },
    onMessage:    ({ text, ttl }) => {
      const msg = Storage.push(text, false, ttl);
      UI.renderMessage(msg);
    },
    onScreenshot: () => UI.showScreenshotToast(),
    onDisconnect: () => UI.sysMsg('Contact déconnecté.'),
  });

  // ── Écran 1 : Identité ──────────────────────────────────────────

  document.getElementById('btn-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(identity.id).then(() => {
      const btn = document.getElementById('btn-copy');
      btn.textContent = 'Copié ✓';
      setTimeout(() => btn.textContent = 'Copier mon ID', 2000);
    });
  });

  document.getElementById('btn-go-connect').addEventListener('click', () => {
    UI.showScreen('screen-connect');
  });

  // ── Écran 2 : Connexion ─────────────────────────────────────────

  document.getElementById('btn-back').addEventListener('click', () => {
    UI.showScreen('screen-identity');
  });

  const doConnect = async () => {
    const targetId = document.getElementById('peer-id-input').value.trim();
    if (!targetId || targetId === identity.id) {
      UI.setConnectStatus('err', targetId === identity.id
        ? 'Tu ne peux pas te connecter à toi-même.'
        : 'Colle un ID valide.');
      return;
    }

    UI.setConnectBtnDisabled(true);
    UI.setConnectStatus('', 'Connexion...');

    try {
      await Peer.connect(targetId);
      UI.setConnectStatus('ok', 'Connecté ✓');
      setTimeout(() => {
        UI.openChat(targetId);
        UI.renderAll(Storage.load());
      }, 500);
    } catch {
      UI.setConnectStatus('err', 'Introuvable — vérifie l\'ID ou que le contact est en ligne.');
      UI.setConnectBtnDisabled(false);
    }
  };

  document.getElementById('btn-do-connect').addEventListener('click', doConnect);
  document.getElementById('peer-id-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doConnect();
  });

  // ── Écran 3 : Chat ──────────────────────────────────────────────

  const sendMsg = async () => {
    const input = document.getElementById('msg-input');
    const text  = input.value.trim();
    if (!text) return;

    if (!Peer.isConnected()) {
      UI.sysMsg('Non connecté.');
      return;
    }

    const ttl = CONFIG.TTL.text;
    try {
      await Peer.send(text, ttl);
      const msg = Storage.push(text, true, ttl);
      UI.renderMessage(msg);
      input.value = '';
    } catch (err) {
      UI.sysMsg('Envoi échoué : ' + err.message);
    }
  };

  document.getElementById('btn-send').addEventListener('click', sendMsg);
  document.getElementById('msg-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });

  // ── Détection screenshot ────────────────────────────────────────

  document.addEventListener('keydown', e => {
    const snap =
      (e.metaKey && e.shiftKey && ['3','4','5'].includes(e.key)) ||
      e.key === 'PrintScreen';
    if (snap) Peer.sendScreenshot();
  });
}

main().catch(console.error);
