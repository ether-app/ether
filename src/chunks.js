// ═══════════════════════════════════════════════════════════════════
//  ÉTHER — Découpage des gros messages
//  PeerJS (sérialisation « json ») rejette les messages de plus de ~16 Ko
//  (erreur message-too-big) : les photos chiffrées sont envoyées en
//  morceaux, puis réassemblées à l'arrivée.
// ═══════════════════════════════════════════════════════════════════

const CHUNK_SIZE  = 12_000;      // caractères par morceau (PeerJS « json » refuse ~16 Ko)
const MAX_TOTAL   = 8_000_000;   // taille max réassemblée
const MAX_PENDING = 8;           // envois partiels simultanés tolérés
const PENDING_TTL = 60_000;      // un envoi incomplet est jeté après 60 s

/** Découpe `payload` (objet dont le champ `field` est une longue chaîne) en messages envoyables. */
export function split(payload, field) {
  const str = payload[field];
  if (str.length <= CHUNK_SIZE) return [payload];
  const id    = crypto.getRandomValues(new Uint32Array(2)).join('-');
  const total = Math.ceil(str.length / CHUNK_SIZE);
  const meta  = { ...payload, [field]: undefined };
  const out   = [];
  for (let i = 0; i < total; i++) {
    out.push({ type: 'chunk', id, i, total, field, part: str.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
               meta: i === 0 ? meta : undefined });
  }
  return out;
}

/** Crée un réassembleur : renvoie le message complet quand le dernier morceau arrive, sinon null. */
export function createAssembler() {
  const pending = new Map();
  return function accept(data) {
    if (data?.type !== 'chunk') return data;
    const { id, i, total, part } = data;
    if (typeof id !== 'string' || typeof part !== 'string' || !Number.isInteger(i) || !Number.isInteger(total)
        || total < 1 || i < 0 || i >= total || total * CHUNK_SIZE > MAX_TOTAL) return null;

    const now = Date.now();
    for (const [k, v] of pending) if (now - v.at > PENDING_TTL) pending.delete(k);

    let p = pending.get(id);
    if (!p) {
      if (pending.size >= MAX_PENDING) return null;
      p = { at: now, total, parts: new Array(total), got: 0, meta: null, field: data.field };
      pending.set(id, p);
    }
    if (p.total !== total || p.parts[i] !== undefined) return null;
    p.parts[i] = part; p.got++;
    if (i === 0) p.meta = data.meta;
    if (p.got < total) return null;

    pending.delete(id);
    if (!p.meta || typeof p.field !== 'string') return null;
    return { ...p.meta, [p.field]: p.parts.join('') };
  };
}
