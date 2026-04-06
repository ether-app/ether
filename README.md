# ÉTHER v1.0

> Communication P2P éphémère — Zéro serveur central. Zéro compte. Zéro trace.

## Architecture

```
ether/
├── index.html          Client web (PWA)
├── manifest.json       PWA manifest
├── sw.js               Service Worker (cache offline)
├── src/
│   ├── config.js       Config signaling + TTL
│   ├── crypto.js       Identité ECDH + chiffrement AES-GCM E2E
│   ├── storage.js      Messages éphémères (localStorage + TTL)
│   ├── peer.js         Connexion WebRTC via PeerJS
│   ├── ui.js           Gestion écrans et rendu
│   ├── app.js          Orchestrateur principal
│   └── style.css       UI dark minimaliste
└── server/
    ├── server.js       Signaling server (PeerJS)
    └── package.json    Dépendances Node.js
```

## Démarrage local

```bash
# Client (depuis la racine)
python3 -m http.server 8080
# → http://localhost:8080

# Signaling server (optionnel en dev — utilise PeerJS cloud par défaut)
cd server && npm install && npm run dev
```

## Déploiement

### 1. Signaling Server → Railway

```bash
# Depuis le dossier server/
railway init
railway up
# Copier l'URL fournie : ether-signal-xxxx.up.railway.app
```

### 2. Mettre à jour la config client

Dans `src/config.js`, remplacer :
```js
SIGNAL_HOST: 'REMPLACE_PAR_URL_RAILWAY',
```
Par l'URL Railway (sans `https://`).

### 3. Client → GitHub Pages

```bash
git init && git add . && git commit -m "feat: ÉTHER v1.0"
gh repo create ether --public --push --source=.
# Activer GitHub Pages → Settings → Pages → Branch: main
```

## Sécurité

| Couche | Mécanisme |
|---|---|
| Transport | WebRTC DTLS (natif) |
| Application | ECDH P-256 + AES-GCM 256 bits |
| Identité | Clé publique dérivée en pair ID |
| Stockage | Aucun serveur — localStorage uniquement |
| TTL | Auto-destruction 24h (texte) / 1h (image) |
