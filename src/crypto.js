// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Crypto
//  - Identité   : paire ECDH P-256
//  - Échange    : ECDH → secret partagé
//  - Chiffrement: AES-GCM 256 bits
// ═══════════════════════════════════════════════════════════════════

const STORE_PRIV = 'ether_privkey';
const STORE_PUB  = 'ether_pubkey';

async function generateKeypair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'],
  );
}

export async function exportPub(publicKey) {
  const raw = await crypto.subtle.exportKey('raw', publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

async function exportPriv(privateKey) {
  return crypto.subtle.exportKey('jwk', privateKey);
}

async function importPub(b64) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

async function importPriv(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
}

async function pubToId(b64) {
  const raw    = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', raw);
  return 'e-' + Array.from(new Uint8Array(digest)).slice(0, 10)
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function loadOrGenerate() {
  const storedPub  = localStorage.getItem(STORE_PUB);
  const storedPriv = localStorage.getItem(STORE_PRIV);

  if (storedPub && storedPriv) {
    try {
      const privateKey = await importPriv(JSON.parse(storedPriv));
      const publicKey  = await importPub(storedPub);
      const id         = await pubToId(storedPub);
      return { privateKey, publicKey, pubKeyB64: storedPub, id };
    } catch { /* régénérer */ }
  }

  const pair      = await generateKeypair();
  const pubKeyB64 = await exportPub(pair.publicKey);
  const privJwk   = await exportPriv(pair.privateKey);
  const id        = await pubToId(pubKeyB64);

  localStorage.setItem(STORE_PUB,  pubKeyB64);
  localStorage.setItem(STORE_PRIV, JSON.stringify(privJwk));

  return { privateKey: pair.privateKey, publicKey: pair.publicKey, pubKeyB64, id };
}

export async function deriveSharedKey(ourPrivateKey, theirPubKeyB64) {
  const theirPubKey = await importPub(theirPubKeyB64);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPubKey },
    ourPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt'],
  );
}

export async function encrypt(sharedKey, plaintext) {
  const iv      = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);
  const out     = new Uint8Array(12 + cipher.byteLength);
  out.set(iv); out.set(new Uint8Array(cipher), 12);
  return btoa(String.fromCharCode(...out));
}

export async function decrypt(sharedKey, b64) {
  const data      = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.slice(0, 12) }, sharedKey, data.slice(12),
  );
  return new TextDecoder().decode(decrypted);
}

// ── Compression photo ─────────────────────────────────────────────────

export function compressImage(file, maxPx, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round(height * maxPx / width);  width = maxPx; }
        else                { width  = Math.round(width  * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}
