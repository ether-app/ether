// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — UI
//  Gestion des écrans, rendu des messages, timers TTL.
// ═══════════════════════════════════════════════════════════════════

// ── Écrans ───────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Screen 1 — Identité ─────────────────────────────────────────────

function initIdentity(id, pubKeyB64) {
  document.getElementById('my-id').textContent = id;

  // QR Code
  new QRCode(document.getElementById('qr-container'), {
    text:         id,
    width:        164,
    height:       164,
    colorDark:    '#000',
    colorLight:   '#fff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function setPeerStatus(text, ready = false) {
  const el = document.getElementById('peer-status');
  el.textContent  = text;
  el.className    = 'peer-status' + (ready ? ' ready' : '');
}

// ── Screen 2 — Connexion ─────────────────────────────────────────────

function setConnectStatus(type, text) {
  const el = document.getElementById('connect-status');
  el.textContent = text;
  el.className   = 'status-msg' + (type ? ' ' + type : '');
}

function setConnectBtnDisabled(disabled) {
  document.getElementById('btn-do-connect').disabled = disabled;
}

// ── Screen 3 — Chat ──────────────────────────────────────────────────

function openChat(peerId) {
  const label = peerId.length > 22 ? peerId.slice(0, 22) + '…' : peerId;
  document.getElementById('contact-label').textContent = label;
  showScreen('screen-chat');
  renderAll([]); // vider avant de remplir
  document.getElementById('msg-input').focus();
}

function renderAll(msgs) {
  const box = document.getElementById('messages');
  box.innerHTML = '';
  msgs.forEach(m => _appendMsg(m, false));
  box.scrollTop = box.scrollHeight;
}

function renderMessage(msg) {
  _appendMsg(msg, true);
}

function sysMsg(text) {
  const box = document.getElementById('messages');
  const el  = document.createElement('div');
  el.className   = 'sys-msg';
  el.textContent = text;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function showScreenshotToast() {
  const t = document.createElement('div');
  t.className   = 'screenshot-toast';
  t.textContent = '⚠ Capture détectée par ton contact';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Interne ──────────────────────────────────────────────────────────

function _appendMsg(msg, scroll) {
  const box = document.getElementById('messages');

  const el   = document.createElement('div');
  el.className     = 'msg ' + (msg.mine ? 'mine' : 'theirs');
  el.dataset.id    = msg.id;

  const txt  = document.createElement('div');
  txt.className    = 'msg-text';
  txt.textContent  = msg.text;

  const ttlEl = document.createElement('div');
  ttlEl.className  = 'msg-ttl';

  el.appendChild(txt);
  el.appendChild(ttlEl);
  box.appendChild(el);

  if (scroll) box.scrollTop = box.scrollHeight;

  _tickTTL(el, msg);
}

function _tickTTL(el, msg) {
  const ttlEl = el.querySelector('.msg-ttl');

  const tick = () => {
    const left = msg.expires - Date.now();
    if (left <= 0) {
      el.classList.add('gone');
      setTimeout(() => el.remove(), 900);
      return;
    }
    if (left < 3_600_000) el.classList.add('soon');
    ttlEl.textContent = _fmt(left);
    setTimeout(tick, 1000);
  };

  tick();
}

function _fmt(ms) {
  if (ms < 60_000)    return Math.floor(ms / 1000)   + 's';
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + 'min';
  return Math.floor(ms / 3_600_000) + 'h';
}

export {
  showScreen, initIdentity, setPeerStatus,
  setConnectStatus, setConnectBtnDisabled,
  openChat, renderAll, renderMessage, sysMsg, showScreenshotToast,
};
