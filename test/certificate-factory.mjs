// Test-only X.509 fixtures, generated in memory with Node crypto. Never used for ACME.
import { generateKeyPairSync, sign, X509Certificate } from 'node:crypto';
const bytes = v => Buffer.isBuffer(v) ? v : Buffer.from(v);
const der = (tag, ...parts) => {
  const body = Buffer.concat(parts.map(bytes)); const n = body.length;
  const length = n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]);
  return Buffer.concat([Buffer.from([tag]), length, body]);
};
const seq = (...x) => der(0x30, ...x);
const oid = hex => der(6, Buffer.from(hex, 'hex'));
const algorithm = seq(oid('2a8648ce3d040302'));
const name = text => seq(der(0x31, seq(oid('550403'), der(0x0c, text))));
const pem = raw => `-----BEGIN CERTIFICATE-----\n${raw.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
const extension = (id, value, critical = false) => seq(oid(id), ...(critical ? [der(1, Buffer.from([255]))] : []), der(4, value));
export function fixturePair() {
  const ca = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const issuer = name('CertRelay TEST ONLY CA');
  function certificate(key, serial, isCA, notBefore = '200101000000Z', notAfter = '401231235959Z') {
    const extensions = isCA ? [extension('551d13', seq(der(1, Buffer.from([255]))), true)] : [
      extension('551d13', seq(), true),
      extension('551d11', seq(der(0x82, 'example.com'), der(0x82, '*.example.com'))),
      extension('551d25', seq(oid('2b06010505070301'))),
    ];
    const tbs = seq(der(0xa0, der(2, Buffer.from([2]))), der(2, Buffer.from([serial])), algorithm, issuer,
      seq(der(0x17, notBefore), der(0x17, notAfter)), isCA ? issuer : name('example.com'),
      key.publicKey.export({ type: 'spki', format: 'der' }), der(0xa3, seq(...extensions)));
    return pem(seq(tbs, algorithm, der(3, Buffer.from([0]), sign('sha256', tbs, ca.privateKey))));
  }
  const caPem = certificate(ca, 1, true);
  const make = serial => {
    const leaf = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    return { domain: 'example.com', fullchain: certificate(leaf, serial, false) + caPem, privateKey: leaf.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  };
  // Ensure the DER fixtures are parseable before testing production validation against them.
  new X509Certificate(caPem);
  return { ca: caPem, one: make(2), two: make(3) };
}
