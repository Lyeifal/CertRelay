import { X509Certificate, createPrivateKey, createHash } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import tls from 'node:tls';
export const digest = value => createHash('sha256').update(value).digest('hex');
export function validateBundle(bundle, { trustedRoots = rootCertificates, requireTrust = true, minimumValidityMs = 3600000 } = {}) {
  if (typeof bundle.fullchain !== 'string' || typeof bundle.privateKey !== 'string' || bundle.fullchain.length > 262144 || bundle.privateKey.length > 32768) throw new Error('Invalid certificate bundle');
  const blocks = bundle.fullchain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!blocks?.length || blocks.length > 10) throw new Error('Invalid certificate chain');
  const chain = blocks.map(pem => new X509Certificate(pem));
  const leaf = chain[0];
  if (leaf.ca || Date.parse(leaf.validFrom) > Date.now() + 300000 || Date.parse(leaf.validTo) < Date.now() + minimumValidityMs) throw new Error('Leaf certificate invalid or expiring');
  if (leaf.keyUsage && !leaf.keyUsage.includes('1.3.6.1.5.5.7.3.1') && !leaf.keyUsage.includes('2.5.29.37.0')) throw new Error('Certificate is not valid for TLS server authentication');
  if (!leaf.checkPrivateKey(createPrivateKey(bundle.privateKey))) throw new Error('Certificate/private key mismatch');
  const root = bundle.domain;
  if (typeof root !== 'string' || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(root)) throw new Error('Invalid domain');
  const sans = leaf.subjectAltName?.split(', ').map(s => s.trim());
  if (!sans?.includes(`DNS:${root}`) || !sans.includes(`DNS:*.${root}`)) throw new Error('Certificate does not cover both apex and wildcard');
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i + 1].ca || !chain[i].checkIssued(chain[i + 1]) || !chain[i].verify(chain[i + 1].publicKey)) throw new Error('Invalid issuer chain');
  }
  if (chain.some(cert => Date.parse(cert.validTo) <= Date.now() || Date.parse(cert.validFrom) > Date.now() + 300000)) throw new Error('Invalid chain validity');
  if (requireTrust) {
    const last = chain.at(-1);
    const trusted = trustedRoots.some(pem => {
      try { const ca = new X509Certificate(pem); return ca.ca && Date.parse(ca.validTo) > Date.now() && (last.raw.equals(ca.raw) || (last.checkIssued(ca) && last.verify(ca.publicKey))); } catch { return false; }
    });
    if (!trusted) throw new Error('Untrusted certificate chain');
  }
  return { fingerprint: leaf.fingerprint256, expiresAt: new Date(leaf.validTo).toISOString(), issuedAt: new Date(leaf.validFrom).toISOString(), issuer: leaf.issuer, fullchainHash: digest(bundle.fullchain), keyHash: digest(bundle.privateKey) };
}

// Use the runtime's native TLS path validation too, including CA constraints,
// key usage and hostname checks. This ephemeral loopback handshake is not a
// connection to the managed service or any external system.
export async function validateTrustedBundle(bundle, { trustedRoots = rootCertificates, requireTrust = true, minimumValidityMs = 3600000 } = {}) {
  const metadata = validateBundle(bundle, { trustedRoots, requireTrust, minimumValidityMs });
  if (!requireTrust) return metadata;
  const sockets = new Set();
  const server = tls.createServer({ cert: bundle.fullchain, key: bundle.privateKey, minVersion: 'TLSv1.2' }, socket => socket.end());
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('tlsClientError', () => {});
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    await new Promise((resolve, reject) => {
      const socket = tls.connect({ host: '127.0.0.1', port: server.address().port, servername: bundle.domain, ca: trustedRoots, rejectUnauthorized: true, timeout: 5000, minVersion: 'TLSv1.2' }, () => { socket.end(); resolve(); });
      socket.on('error', () => reject(new Error('Native TLS certificate path validation failed')));
      socket.on('timeout', () => socket.destroy(new Error('Certificate validation timeout')));
    });
    return metadata;
  } finally {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}
