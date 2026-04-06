// ── Configuration ÉTHER ─────────────────────────────────────────────

const DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

const CONFIG = {
  // Toujours PeerJS cloud pour l'instant — Railway en backup quand stabilisé
  SIGNAL_HOST:   '0.peerjs.com',
  SIGNAL_PORT:   443,
  SIGNAL_PATH:   '/',
  SIGNAL_SECURE: true,

  TTL: {
    text:  24 * 60 * 60 * 1000,  // 24h
    image:      60 * 60 * 1000,  // 1h
    group:   6 * 60 * 60 * 1000, // 6h
  },

  PHOTO_MAX_PX:     1024,  // résolution max avant compression
  PHOTO_QUALITY:    0.72,  // qualité JPEG

  VERSION: '1.1.0',
};

export default CONFIG;
