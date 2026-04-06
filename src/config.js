// ── Configuration ÉTHER ─────────────────────────────────────────────
// Après déploiement Railway : remplace SIGNAL_HOST par ton URL Railway

const DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

const CONFIG = {

  // Signaling server
  // Dev  : PeerJS cloud (temporaire, aucune config requise)
  // Prod : ton serveur Railway — ex: 'ether-signal-prod.up.railway.app'
  SIGNAL_HOST:   DEV ? '0.peerjs.com'                    : 'ether-signal-production.up.railway.app',
  SIGNAL_PORT:   443,
  SIGNAL_PATH:   DEV ? '/'                               : '/signal',
  SIGNAL_SECURE: true,

  // Durée de vie des messages
  TTL: {
    text:  24 * 60 * 60 * 1000,  // 24 heures
    image:      60 * 60 * 1000,  // 1 heure
  },

  VERSION: '1.0.0',
};

export default CONFIG;
