# ÉTHER v1.4

> Messagerie P2P éphémère : pas de serveur qui garde les messages, pas de compte, pas de numéro de téléphone.

- **App** : https://ether-app.github.io/ether/app.html
- **Landing** : https://ether-app.github.io/ether/
- **Statut** : ⏸ en pause depuis le 2026-11-11, voir [État et reprise](#état-et-reprise)

## Fonctionnalités

| Fonction | Détail |
|---|---|
| Messages directs | WebRTC (PeerJS), chiffrés de bout en bout (ECDH P-256 + AES-GCM 256) |
| Identité | Paire de clés générée sur l'appareil ; l'ID (`e-` + 20 hex) est l'empreinte SHA-256 de la clé publique |
| Vérification | Clé reçue contrôlée contre l'ID appelé (coupure si différente) + code de sécurité à 25 chiffres à comparer de vive voix |
| Invitation | Lien `app.html#c=<id>` (partage natif iOS/Android) ; le QR code contient ce lien ; connexion automatique à l'ouverture |
| Photos | Compressées (1024 px, JPEG 0,72), chiffrées, envoyées en morceaux de 12 Ko ; seules les images `data:` sont affichées (pas d'URL externe) |
| Groupes | Jusqu'à 10 membres, token 6 caractères, TTL 6 h, topologie en étoile (le créateur relaie) |
| Éphémère | Texte 24 h, photo 1 h, groupe 6 h |
| Lecture unique 🔥 | Messages directs : flouté jusqu'au toucher, lisible 10 s, jamais enregistré, détruit des deux côtés |
| Mode sans trace | Clé non exportable jamais écrite, messages en mémoire seulement, nouvelle identité à chaque ouverture |
| PWA | Installable, service worker (cache versionné dans `sw.js`) |

## Architecture

```
ether/
├── index.html          Landing page
├── app.html            Application
├── manifest.json       PWA
├── sw.js               Service worker — incrémenter VERSION à chaque livraison
├── src/
│   ├── config.js       Serveur de signalisation, TTL, version
│   ├── crypto.js       Identité, ECDH, AES-GCM, code de sécurité, base64 par blocs, filtre images
│   ├── chunks.js       Découpage / réassemblage des gros messages
│   ├── storage.js      Messages (localStorage ou mémoire en mode sans trace)
│   ├── peer.js         Connexion directe : échange de clés, vérification, envoi, lecture unique
│   ├── groups.js       Groupes éphémères
│   ├── ui.js           Écrans, rendu, bandeau de sécurité, lecture unique
│   ├── app.js          Orchestrateur
│   └── style.css       UI sombre
└── server/             Serveur de signalisation PeerJS (non déployé, cf. Reprise)
```

## Démarrage local

```bash
python3 -m http.server 8080   # → http://localhost:8080/app.html
```

Tester à deux sur un seul Mac : ouvrir `localhost:8080` et `127.0.0.1:8080` (stockages séparés, donc deux identités).
Le service worker met les fichiers en cache : en cas de comportement étrange, le désinscrire (DevTools → Application) ou changer de port.

## Déploiement

GitHub Pages sur `main` (organisation `ether-app`). Un `git push` suffit ; la mise en ligne prend environ 1 minute.
Penser à incrémenter `VERSION` dans `sw.js` (et `config.js`) pour forcer la mise à jour chez les utilisateurs.

## Sécurité

| Couche | Mécanisme |
|---|---|
| Transport | WebRTC DTLS (natif) |
| Application | ECDH P-256 → AES-GCM 256, clé par paire d'appareils |
| Anti-interception | ID = empreinte de la clé (vérifié automatiquement) + code de sécurité comparé de vive voix |
| Stockage | Aucun serveur ; localStorage avec purge TTL, ou mémoire seule (sans trace) |
| Images | Seules les images incluses dans le message (`data:image/...`) sont affichées |

Audit initial et suivi des corrections : [SECURITY-AUDIT-2026-09-08.md](SECURITY-AUDIT-2026-09-08.md).

## État et reprise

### Testé et validé (2026-11-07 → 11)
- iPhone en 4G ↔ Mac : connexion, messages, photos, boutons, code de sécurité, lien d'invitation, lecture unique, mode sans trace.

### Limites connues
- **Les deux personnes doivent être en ligne en même temps** (pas de distribution différée).
- **Signalisation** : serveur public `0.peerjs.com` (tiers). Le serveur Railway a été supprimé. Il ne voit pas les messages, et l'interception est neutralisée par la vérification de clé, mais l'app dépend d'un service qu'on ne maîtrise pas.
- **Pas de relais TURN configuré** : la connexion peut échouer sur des réseaux très fermés (entreprise, hôtel).
- **Captures d'écran** : impossibles à bloquer ou détecter depuis une page web. L'alerte actuelle (raccourcis clavier Mac) n'est pas fiable, donc à retirer ou remplacer.
- **Groupes** : clé dérivée du seul token de 6 caractères (sel PBKDF2 statique), sans code de sécurité ni lecture unique.

### Prochaines étapes, par priorité
1. **Masquer le contenu quand l'app passe en arrière-plan** (aperçu du sélecteur d'apps) et retirer la fausse alerte de capture. Petit chantier.
2. **Décision : appli native via Capacitor** pour avoir l'alerte de capture façon Snapchat (iOS) et le blocage des captures (Android `FLAG_SECURE`, astuce champ sécurisé sur iOS). Coût : Apple 99 €/an, Google 25 € une fois, Xcode, validation App Store.
3. **Décision : héberger notre signalisation** (Fly.io gratuit recommandé, ou Hostinger) + un relais TURN. Le code serveur existe dans `server/` ; à durcir avant (Helmet, CORS restreint, rate limit, mise à jour de `ws`/`qs`).
4. Envoi de fichiers (PDF, documents), puis notes vocales et appels audio/vidéo.
5. Renforcer les groupes (token plus long ou clé partagée via le QR, code de sécurité).
6. Côté business : interroger 5 cibles (avocats, journalistes) avant d'investir davantage.
