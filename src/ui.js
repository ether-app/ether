// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — UI
// ═══════════════════════════════════════════════════════════════════

// ── Screens ───────────────────────────────────────────────────────────

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Screen 1 — Identité ──────────────────────────────────────────────

export function initIdentity(id) {
  document.getElementById('my-id').textContent = id;
  new QRCode(document.getElementById('qr-container'), {
    text: id, width: 160, height: 160,
    colorDark: '#000', colorLight: '#fff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

export function setPeerStatus(text, ready = false) {
  const el = document.getElementById('peer-status');
  el.textContent = text;
  el.className   = 'peer-status' + (ready ? ' ready' : '');
}

// ── Screen 2 — Connexion (onglets Direct | Groupe) ────────────────────

export function setConnectStatus(type, text) {
  const el = document.getElementById('connect-status');
  el.textContent = text;
  el.className   = 'status-msg' + (type ? ' ' + type : '');
}
export function setConnectBtnDisabled(v) { document.getElementById('btn-do-connect').disabled = v; }

// ── Screen 3 — Chat 1-1 ───────────────────────────────────────────────

export function openChat(peerId) {
  const label = peerId.length > 22 ? peerId.slice(0, 22) + '…' : peerId;
  document.getElementById('contact-label').textContent = label;
  document.getElementById('member-count').textContent  = '';
  showScreen('screen-chat');
  document.getElementById('msg-input').focus();
}

// ── Screen 4 — Groupe : créer ─────────────────────────────────────────

export function showGroupCreate(token) {
  document.getElementById('group-token-display').textContent = token;
  new QRCode(document.getElementById('group-qr'), {
    text: token, width: 140, height: 140,
    colorDark: '#000', colorLight: '#fff',
    correctLevel: QRCode.CorrectLevel.M,
  });
  showScreen('screen-group-create');
}

export function setGroupMemberCount(n) {
  const el = document.getElementById('member-count');
  if (el) el.textContent = n > 0 ? `${n} membre${n > 1 ? 's' : ''}` : '';
}

// ── Screen Chat — groupe ──────────────────────────────────────────────

export function openGroupChat(token, isHub) {
  document.getElementById('contact-label').textContent = `Groupe ${token}`;
  setGroupMemberCount(isHub ? 1 : null);
  showScreen('screen-chat');
  document.getElementById('msg-input').focus();
}

// ── Messages ──────────────────────────────────────────────────────────

export function renderAll(msgs) {
  const box = document.getElementById('messages');
  box.innerHTML = '';
  const now = Date.now();
  msgs.filter(m => m.expires > now).forEach(m => _appendMsg(m, false));
  box.scrollTop = box.scrollHeight;
}

export function renderMessage(msg) { _appendMsg(msg, true); }

export function sysMsg(text) {
  const box = document.getElementById('messages');
  const el  = document.createElement('div');
  el.className = 'sys-msg'; el.textContent = text;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

export function showScreenshotToast() {
  _toast('⚠ Capture détectée par ton contact', 'screenshot-toast', 4000);
}

function _toast(text, cls, delay) {
  const t = document.createElement('div');
  t.className = cls; t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), delay);
}

// ── QR Scanner ────────────────────────────────────────────────────────

let _scanStream = null;

export function openQRScanner(onResult) {
  const overlay = document.getElementById('qr-scanner-overlay');
  const video   = document.getElementById('qr-video');
  const canvas  = document.createElement('canvas');
  const ctx     = canvas.getContext('2d', { willReadFrequently: true });

  overlay.classList.add('active');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      _scanStream = stream;
      video.srcObject = stream;
      video.play();

      const scan = () => {
        if (!overlay.classList.contains('active')) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width  = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            closeQRScanner();
            onResult(code.data);
            return;
          }
        }
        requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
    })
    .catch(() => {
      closeQRScanner();
      alert('Caméra inaccessible — colle l\'ID manuellement.');
    });
}

export function closeQRScanner() {
  document.getElementById('qr-scanner-overlay').classList.remove('active');
  if (_scanStream) { _scanStream.getTracks().forEach(t => t.stop()); _scanStream = null; }
}

// ── Notifications ─────────────────────────────────────────────────────

export async function requestNotifPermission() {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') await Notification.requestPermission();
  } catch { /* Safari web ignore */ }
}

export function notifyMessage(text, isImage) {
  try {
    if (typeof Notification === 'undefined') return;
    if (document.hidden && Notification.permission === 'granted') {
      new Notification('ÉTHER', {
        body: isImage ? '📷 Photo reçue' : text.slice(0, 80),
        silent: false,
      });
    }
  } catch { /* ignore */ }
}

// ── Interne ───────────────────────────────────────────────────────────

function _appendMsg(msg, scroll) {
  const box  = document.getElementById('messages');
  const el   = document.createElement('div');
  el.className    = 'msg ' + (msg.mine ? 'mine' : 'theirs');
  el.dataset.id   = msg.id;

  if (msg.isImage) {
    const img     = document.createElement('img');
    img.src       = msg.text;
    img.className = 'msg-img';
    img.loading   = 'lazy';
    el.appendChild(img);
  } else {
    const txt     = document.createElement('div');
    txt.className = 'msg-text';
    txt.textContent = msg.from ? `[${msg.from}] ${msg.text}` : msg.text;
    el.appendChild(txt);
  }

  const ttlEl     = document.createElement('div');
  ttlEl.className = 'msg-ttl';
  el.appendChild(ttlEl);
  box.appendChild(el);

  if (scroll) box.scrollTop = box.scrollHeight;
  _tickTTL(el, msg);
}

function _tickTTL(el, msg) {
  const ttlEl = el.querySelector('.msg-ttl');
  const tick  = () => {
    const left = msg.expires - Date.now();
    if (left <= 0)         { el.classList.add('gone'); setTimeout(() => el.remove(), 900); return; }
    if (left < 3_600_000)  el.classList.add('soon');
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
