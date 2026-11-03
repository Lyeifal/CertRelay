import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import tls from 'node:tls';
import { mkdtemp, readFile, writeFile, readlink as nativeReadlink, rm, stat } from 'node:fs/promises';
import { fixturePair } from './certificate-factory.mjs';
import { validateBundle } from '../shared/certificates.mjs';
import { syncAgent, verifyTLS } from '../agent/sync.mjs';

const readlink = async file => (await nativeReadlink(file)).replaceAll('\\', '/');
const p = fixturePair(); const validator = bundle => validateBundle(bundle, { trustedRoots: [p.ca] });
const directory = await mkdtemp(path.join(os.tmpdir(), 'certrelay-agent-test-'));
const id = 'cert-1234567890abcdef'; const version1 = '1'.repeat(32); const version2 = '2'.repeat(32);
const identity = { server_url: 'http://127.0.0.1:4173', agent_id: 'agent-1234567890abcdef', agent_token: 'a'.repeat(64) };
const target = { id, domain: 'example.com', directory, check: ['/fake/nginx', '-t'], reload: ['/fake/systemctl', 'reload', 'nginx'], verify: { host: '127.0.0.1', port: 443, servername: 'example.com' } };
let currentBundle = p.one; let version = version1; let staging = false; const receipts = []; let failReload = false; let reloads = 0; let probes = 0; let failProbe = false; let calls = 0; let downloads = 0;
const fetchImpl = async (url, options) => {
  calls++;
  assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, `Bearer ${identity.agent_token}`);
  if (url.pathname.endsWith('/manifest')) return Response.json({ protocol_version: 1, certificates: [{ id, domain: 'example.com', version, staging, ...validator(currentBundle) }] });
  if (url.pathname.includes('/certificates/')) { downloads++; return Response.json({ ...currentBundle, version }); }
  if (url.pathname.endsWith('/receipts')) { receipts.push(JSON.parse(options.body)); return new Response(null, { status: 204 }); }
  if (url.pathname.endsWith('/heartbeat')) return new Response(null, { status: 204 });
  throw new Error('Unexpected endpoint');
};
const execute = async (file, args) => {
  assert(!file.includes(';')); if (args.includes('reload')) { reloads++; if (failReload) { failReload = false; throw new Error('reload fails once'); } }
};
const probe = async (target, fingerprint) => { probes++; if (failProbe && fingerprint === validator(p.two).fingerprint) throw new Error('wrong loaded fingerprint'); };
let lastFailure;
const sync = extra => syncAgent({ identity, config: { certificates: [target] }, validator, fetchImpl, execute, probe, onFailure: error => { lastFailure = error; }, ...extra });
let count = 0; const check = async (title, fn) => { await fn(); count++; console.log(`PASS ${title}`); };
try {
  await check('first install verifies and acknowledges immutable bundle', async () => {
    const result = await sync(); assert.equal(result[0].status, 'installed');
    assert.equal(await readlink(path.join(directory, 'current')), `versions/${version1}`);
    assert.equal(await readFile(path.join(directory, 'current/privkey.pem'), 'utf8'), p.one.privateKey);
    assert.equal(receipts.at(-1).status, 'installed'); assert(probes > 0);
    if (process.platform !== 'win32') assert.equal((await stat(path.join(directory, 'current/privkey.pem'))).mode & 0o777, 0o600);
  });
  await check('unchanged release is verified and receipt retried without reload', async () => {
    const previousReloads = reloads; const previousDownloads = downloads; const result = await sync(); assert.equal(result[0].status, 'verified'); assert.equal(reloads, previousReloads); assert.equal(downloads, previousDownloads);
  });
  await check('reload failure atomically restores old files and reloads old service', async () => {
    version = version2; currentBundle = p.two; failReload = true;
    const result = await sync(); assert.equal(result[0].status, 'failed');
    assert.equal(await readlink(path.join(directory, 'current')), `versions/${version1}`);
    assert.equal(receipts.at(-1).status, 'failed');
  });
  await check('TLS fingerprint failure rolls back instead of reporting installed', async () => {
    failProbe = true; const result = await sync(); failProbe = false;
    assert.equal(result[0].status, 'failed'); assert.equal(await readlink(path.join(directory, 'current')), `versions/${version1}`);
  });
  await check('retry can activate previously validated immutable version', async () => {
    const result = await sync(); assert.equal(result[0].status, 'installed', lastFailure?.stack); assert.equal(await readlink(path.join(directory, 'current')), `versions/${version2}`);
  });
  await check('staging releases are never installed', async () => {
    staging = true; const result = await sync(); staging = false; assert.equal(result[0].status, 'failed'); assert.equal(await readlink(path.join(directory, 'current')), `versions/${version2}`);
  });
  await check('unconfigured certificate never writes files', async () => {
    const result = await sync({ config: { certificates: [] } }); assert.equal(result[0].status, 'unconfigured');
  });
  await check('managed mode discovers every authorized certificate from the manifest', async () => {
    const managedRoot = path.join(directory, 'managed');
    const result = await sync({ config: { mode: 'managed', directoryRoot: managedRoot, check: target.check, reload: target.reload, verify: target.verify } });
    assert.equal(result[0].status, 'installed');
    assert.equal(await readlink(path.join(managedRoot, 'example.com', 'current')), `versions/${version2}`);
  });
  await check('server domain cannot change local installation mapping', async () => {
    await assert.rejects(sync({ config: { certificates: [{ ...target, domain: 'example.net', verify: { ...target.verify, servername: 'example.net' } }] } }), /domain/);
  });
  await check('existing partial immutable version is rejected', async () => {
    await writeFile(path.join(directory, 'versions', version2, 'privkey.pem'), 'corrupt');
    const result = await sync(); assert.equal(result[0].status, 'failed');
    await writeFile(path.join(directory, 'versions', version2, 'privkey.pem'), p.two.privateKey);
  });
  await check('crash journal restores previous certificate before retry', async () => {
    await writeFile(path.join(directory, 'pending.json'), JSON.stringify({ previous: version1, next: version2 }));
    const result = await sync(); assert.equal(result[0].status, 'installed'); await assert.rejects(readFile(path.join(directory, 'pending.json')), { code: 'ENOENT' });
  });
  await check('concurrent sync lock rejects before activation', async () => {
    await writeFile(path.join(directory, 'sync.lock'), ''); await assert.rejects(sync(), /locked/); await rm(path.join(directory, 'sync.lock'));
  });
  await check('actual local TLS socket fingerprint verification', async () => {
    const server = tls.createServer({ cert: p.two.fullchain, key: p.two.privateKey }, socket => socket.end());
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try { await verifyTLS({ host: '127.0.0.1', port: server.address().port, servername: 'example.com' }, validator(p.two).fingerprint); } finally { await new Promise(resolve => server.close(resolve)); }
  });
  console.log(`${count} agent installation and rollback checks passed; ${calls} protocol calls`);
} finally { await rm(directory, { recursive: true, force: true }); }
