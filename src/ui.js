// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — UI
// ═══════════════════════════════════════════════════════════════════

// ── Screens ───────────────────────────────────────────────────────────

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Screen 1 — Identité ──────────────────────────────────────────────

export function initIdentity(id, link) {
  document.getElementById('my-id').textContent = id;
  // Le QR contient le lien d'invitation : l'appareil photo de l'iPhone l'ouvre directement
  new QRCode(document.getElementById('qr-container'), {
    text: link || id, width: 160, height: 160,
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
  document.getElementById('btn-burn').hidden = false;
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
  document.getElementById('btn-burn').hidden = true; // lecture unique : messages directs uniquement
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

// ── Code de sécurité ──────────────────────────────────────────────────

export function showSafetyCode(code, verified) {
  const bar = document.getElementById('safety-bar');
  document.getElementById('safety-code').textContent = code;
  bar.hidden = false;
  bar.classList.toggle('verified', verified);
  document.getElementById('safety-state').textContent = verified ? '✓ Contact vérifié' : '🔒 Vérifier le contact';
  bar.classList.toggle('open', !verified);
  _fitMessages();
}
export function hideSafetyCode() { document.getElementById('safety-bar').hidden = true; _fitMessages(); }
export function toggleSafetyDetail() { document.getElementById('safety-bar').classList.toggle('open'); _fitMessages(); }

// La liste des messages commence sous le bandeau du code de sécurité
function _fitMessages() {
  const bar = document.getElementById('safety-bar');
  const box = document.getElementById('messages');
  box.style.top = bar.hidden ? '' : (52 + bar.offsetHeight) + 'px';
}

export function alertToast(text) { _toast(text, 'screenshot-toast', 6000); }

// ── Lecture unique ────────────────────────────────────────────────────

const BURN_READ_MS = 10_000; // durée d'affichage après ouverture
let _onBurn = () => {};
export function setBurnHandler(fn) { _onBurn = fn; }

export function setBurnMode(on) {
  const b = document.getElementById('btn-burn');
  b.classList.toggle('active', on);
  b.setAttribute('aria-pressed', String(on));
  document.getElementById('msg-input').placeholder = on ? 'Message à lecture unique...' : 'Message...';
}

/** Détruit un message affiché (accusé reçu côté expéditeur). */
export function burnMessage(id) {
  const el = document.querySelector(`#messages [data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.classList.add('gone');
  setTimeout(() => el.remove(), 900);
  sysMsg('🔥 Message lu et détruit.');
}

function _setupBurn(el, msg) {
  el.classList.add('burn');
  const ttlEl = el.querySelector('.msg-ttl');
  if (msg.mine) { el._label = '🔥 non lu'; ttlEl.textContent = el._label; return; }

  el.classList.add('sealed');
  el._label = '🔥 Toucher pour lire';
  ttlEl.textContent = el._label;
  el.addEventListener('click', () => {
    if (!el.classList.contains('sealed')) return;
    el.classList.remove('sealed');
    const end = Date.now() + BURN_READ_MS;
    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) {
        el.classList.add('gone');
        setTimeout(() => el.remove(), 900);
        _onBurn(msg.id);
        return;
      }
      el._label = '🔥 ' + Math.ceil(left / 1000) + 's';
      ttlEl.textContent = el._label;
      setTimeout(tick, 250);
    };
    tick();
  }, { once: false });
}

// ── Interne ───────────────────────────────────────────────────────────

const _SAFE_IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

function _appendMsg(msg, scroll) {
  const box  = document.getElementById('messages');
  const el   = document.createElement('div');
  el.className    = 'msg ' + (msg.mine ? 'mine' : 'theirs');
  el.dataset.id   = msg.id;

  if (msg.isImage && !_SAFE_IMG.test(msg.text || '')) {
    const txt = document.createElement('div');
    txt.className = 'msg-text'; txt.textContent = '[image refusée]';
    el.appendChild(txt);
  } else if (msg.isImage) {
    if (msg.from) {
      const who = document.createElement('div');
      who.className = 'msg-from'; who.textContent = msg.from;
      el.appendChild(who);
    }
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
  if (msg.burn) _setupBurn(el, msg);
  _tickTTL(el, msg);
}

function _tickTTL(el, msg) {
  const ttlEl = el.querySelector('.msg-ttl');
  const tick  = () => {
    const left = msg.expires - Date.now();
    if (left <= 0)         { el.classList.add('gone'); setTimeout(() => el.remove(), 900); return; }
    if (left < 3_600_000 && !el._label)  el.classList.add('soon');
    ttlEl.textContent = el._label || _fmt(left);
    setTimeout(tick, 1000);
  };
  tick();
}

function _fmt(ms) {
  if (ms < 60_000)    return Math.floor(ms / 1000)   + 's';
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + 'min';
  return Math.floor(ms / 3_600_000) + 'h';
}
