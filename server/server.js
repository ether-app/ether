// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Signaling Server
//  Rôle unique : mettre deux pairs en relation.
//  Ne voit jamais le contenu des messages.
// ═══════════════════════════════════════════════════════════════════

const express             = require('express');
const cors                = require('cors');
const http                = require('http');
const { ExpressPeerServer } = require('peer');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

// Health check Railway
app.get('/', (_req, res) => res.json({
  service: 'ÉTHER Signal',
  status:  'ok',
  version: '1.0.0',
}));

// PeerJS sur /signal
const peerServer = ExpressPeerServer(server, {
  path:            '/',
  allow_discovery: false,
  proxied:         true,
});

app.use('/signal', peerServer);

peerServer.on('connection',  client => console.log(`[+] ${client.getId()}`));
peerServer.on('disconnect',  client => console.log(`[-] ${client.getId()}`));

server.listen(PORT, () => console.log(`ÉTHER signal :${PORT}`));
