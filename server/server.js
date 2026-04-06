// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Signaling Server
//  Rôle unique : mettre deux pairs en relation.
//  Ne voit jamais le contenu des messages.
// ═══════════════════════════════════════════════════════════════════

import express      from 'express';
import cors         from 'cors';
import { createServer }      from 'http';
import { ExpressPeerServer } from 'peer';

const app    = express();
const server = createServer(app);
const PORT   = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

// Health check — Railway l'utilise pour vérifier que le service tourne
app.get('/', (_req, res) => res.json({
  service: 'ÉTHER Signal',
  status:  'ok',
  version: '1.0.0',
}));

// Serveur PeerJS monté sur /signal
const peerServer = ExpressPeerServer(server, {
  path:            '/signal',
  allow_discovery: false,   // ne pas exposer la liste des pairs
  proxied:         true,    // Railway est derrière un reverse proxy
});

app.use('/signal', peerServer);

// Logs minimalistes — on ne log que les connexions, jamais le contenu
peerServer.on('connection',  client => console.log(`[+] ${client.getId()}`));
peerServer.on('disconnect',  client => console.log(`[-] ${client.getId()}`));

server.listen(PORT, () => console.log(`ÉTHER signal :${PORT}`));
