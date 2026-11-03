import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fixturePair } from './certificate-factory.mjs';
import { validateBundle, validateTrustedBundle } from '../shared/certificates.mjs';
import { Store, Vault, passwordHash } from '../server/security.mjs';
import { createApplication } from '../server/application.mjs';

let count = 0;
const check = async (title, fn) => { await fn(); count++; console.log(`PASS ${title}`); };
const fixtures = fixturePair();
const validator = bundle => validateBundle(bundle, { trustedRoots: [fixtures.ca] });
await check('real X509 chain, wildcard/apex, matching private key', () => { assert.match(validator(fixtures.one).issuer, /TEST ONLY/); });
await check('native TLS validates CA path and hostname', async () => {
  await validateTrustedBundle(fixtures.one, { trustedRoots: [fixtures.ca] });
  await assert.rejects(validateTrustedBundle(fixtures.one), /Untrusted/);
});
await check('reject mismatched private key', () => assert.throws(() => validator({ ...fixtures.one, privateKey: fixtures.two.privateKey }), /mismatch/));
await check('reject unrelated domain and untrusted CA', () => {
  assert.throws(() => validator({ ...fixtures.one, domain: 'other.example.com' }), /cover/);
  assert.throws(() => validateBundle(fixtures.one), /Untrusted/);
  assert.throws(() => validator({ ...fixtures.one, fullchain: 'not a PEM' }), /chain/);
});
await check('vault authenticates data and purpose', () => {
  const vault = new Vault(Buffer.alloc(32, 9)); const secret = vault.seal({ token: 'test-only' }, 'credential:one');
  assert.deepEqual(vault.unseal(secret, 'credential:one'), { token: 'test-only' });
  assert.throws(() => vault.unseal(secret, 'credential:two'));
  const tampered = { ...secret, tag: Buffer.alloc(16).toString('base64') };
  assert.throws(() => vault.unseal(tampered, 'credential:one'));
});
const directory = await mkdtemp(path.join(os.tmpdir(), 'certrelay-security-'));
let app;
try {
  let store = await Store.load(directory);
  await check('exclusive data directory lock', async () => { await assert.rejects(Store.load(directory), /locked/); });
  const admin = await passwordHash('test-only-long-administrator-password');
  await store.transaction(s => { s.admin = admin; s.settings.email = 'admin@example.test'; });
  await check('failed transaction does not mutate durable state', async () => {
    await assert.rejects(store.transaction(s => { s.settings.renewalDays = 999; throw new Error('rollback'); }));
    assert.equal(store.state.settings.renewalDays, 30);
    await store.transaction(s => { s.settings.renewalDays = 25; });
    assert.equal(store.state.settings.renewalDays, 25);
  });
  await store.close();
  let timestamp = Date.now(); let failIssue = false; let issueCalls = 0;
  const start = async () => {
    app = await createApplication({ directory, publicUrl: 'http://127.0.0.1:4173', allowLocalHttp: true, port: 0, schedule: false, clock: () => timestamp, validator,
      issuer: async () => { issueCalls++; if (failIssue) throw new Error('SECRET-DO-NOT-LOG'); return { bundle: fixtures.one, workspace: { test: 'workspace-secret' } }; },
    });
    await app.listen();
  };
  await start();
  let base = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = ''; let csrf = '';
  const request = async (route, method = 'GET', input, { admin = true, headers = {} } = {}) => {
    const response = await fetch(base + '/api/v1/' + route, { method, headers: {
      ...(input !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(admin ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}), ...headers,
    }, ...(input !== undefined ? { body: JSON.stringify(input) } : {}) });
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
  };
  const login = async () => {
    const result = await request('auth/login', 'POST', { password: 'test-only-long-administrator-password' });
    assert.equal(result.status, 200); cookie = result.headers.get('set-cookie').split(';')[0]; csrf = result.body.csrf;
  };
  await check('all management APIs require login', async () => {
    assert.equal((await request('admin/state', 'GET', undefined, { admin: false })).status, 401);
    assert.equal((await request('admin/credentials', 'POST', {}, { admin: false })).status, 401);
  });
  await login();
  await check('CSRF and Origin protection', async () => {
    assert.equal((await request('admin/credentials', 'POST', {}, { headers: { 'X-CSRF-Token': '' } })).status, 403);
    assert.equal((await request('admin/credentials', 'POST', {}, { headers: { Origin: 'https://attacker.example' } })).status, 403);
    const bad = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(bad.status, 415);
  });
  let cf; let ali; let certificate; let second;
  await check('encrypt Cloudflare/Alibaba secrets and never echo them', async () => {
    cf = await request('admin/credentials', 'POST', { name: 'Cloudflare', provider: 'cf', secret: { token: 'CF_SECRET_TEST_ONLY_1234567890' } }); assert.equal(cf.status, 201);
    ali = await request('admin/credentials', 'POST', { name: 'Alibaba', provider: 'ali', secret: { accessKeyId: 'TEST_KEY_ID', accessKeySecret: 'ALI_SECRET_TEST_ONLY_123456' } }); assert.equal(ali.status, 201);
    const disk = await readFile(path.join(directory, 'state.json'), 'utf8');
    assert(!disk.includes('CF_SECRET_TEST_ONLY')); assert(!disk.includes('ALI_SECRET_TEST_ONLY'));
    assert(!JSON.stringify(cf.body).includes('secret'));
  });
  await check('domain validation, normalization and credential references', async () => {
    assert.equal((await request('admin/certificates', 'POST', { domain: 'https://example.com', credentialId: cf.body.id })).status, 422);
    certificate = await request('admin/certificates', 'POST', { domain: '*.EXAMPLE.COM.', credentialId: cf.body.id }); assert.equal(certificate.status, 201); assert.equal(certificate.body.domain, 'example.com');
    assert.equal((await request('admin/certificates', 'POST', { domain: 'example.com', credentialId: cf.body.id })).status, 409);
    second = await request('admin/certificates', 'POST', { domain: 'example.net', credentialId: cf.body.id, autoRenew: false }); assert.equal(second.status, 201);
    assert.equal((await request(`admin/credentials/${cf.body.id}`, 'DELETE', {})).status, 409);
    assert.equal((await request(`admin/credentials/${ali.body.id}`, 'DELETE', {})).status, 204);
  });
  const invitation = async name => {
    const result = await request('admin/enrollments', 'POST', { name, certificateIds: [certificate.body.id] }); assert.equal(result.status, 201); return result.body;
  };
  const claim = (invite, code = invite.code) => request(`enrollments/${invite.invitation_id}/claim`, 'POST', { code, name: 'actual-host', arch: 'arm64' }, { admin: false });
  let identity;
  await check('one-time invitation eight-way race', async () => {
    const invite = await invitation('real-host');
    const result = await Promise.all(Array.from({ length: 8 }, () => claim(invite)));
    assert.equal(result.filter(r => r.status === 201).length, 1); assert.equal(result.filter(r => r.status === 410).length, 7);
    identity = result.find(r => r.status === 201).body;
  });
  await check('five failed codes lock invitation', async () => {
    const invite = await invitation('locked-host');
    for (let i = 0; i < 5; i++) assert.equal((await claim(invite, '00000000')).status, 401);
    assert.equal((await claim(invite)).status, 410);
  });
  await check('expired/revoked invitations rejected; GET hides code', async () => {
    const invite = await invitation('expired-host'); const page = await fetch(base + `/enroll/${invite.invitation_id}`);
    assert(!(await page.text()).includes(invite.code)); timestamp += 600001; assert.equal((await claim(invite)).status, 410);
    const revoked = await invitation('revoked-host'); assert.equal((await request(`admin/enrollments/${revoked.invitation_id}/revoke`, 'POST', {})).status, 204); assert.equal((await claim(revoked)).status, 410);
  });
  await check('regenerated invitation invalidates old link/code and keeps short expiry', async () => {
    const previous = await invitation('regenerated-host');
    const fresh = await request(`admin/enrollments/${previous.invitation_id}/regenerate`, 'POST', {}); assert.equal(fresh.status, 201);
    assert.notEqual(fresh.body.invitation_id, previous.invitation_id); assert.equal((await claim(previous)).status, 410);
    assert.equal(Date.parse(fresh.body.expires_at) - timestamp, 600000);
    assert.equal((await claim(fresh.body)).status, 201);
  });
  const auth = { admin: false, headers: { Authorization: `Bearer ${identity.agent_token}` } };
  await check('real bundle validation, encrypted publication, authorized manifest', async () => {
    assert.equal((await request(`admin/certificates/${certificate.body.id}/issue`, 'POST', {})).status, 202); await app.idle();
    assert.equal(issueCalls, 1);
    const manifest = await request('agent/manifest', 'GET', undefined, auth); assert.equal(manifest.body.certificates.length, 1);
    const item = manifest.body.certificates[0]; assert.equal(item.domain, 'example.com');
    const bundle = await request(`agent/certificates/${item.id}/${item.version}`, 'GET', undefined, auth); assert.equal(bundle.status, 200); assert.equal(validator(bundle.body).fingerprint, item.fingerprint);
    const disk = await readFile(path.join(directory, 'state.json'), 'utf8'); assert(!disk.includes('PRIVATE KEY')); assert(!disk.includes('workspace-secret'));
    assert.equal((await request(`agent/certificates/${second.body.id}/${item.version}`, 'GET', undefined, auth)).status, 403);
    assert.equal((await request(`agent/certificates/${item.id}/${'0'.repeat(32)}`, 'GET', undefined, auth)).status, 409);
  });
  await check('receipt requires authorized current version and fingerprint', async () => {
    const item = (await request('agent/manifest', 'GET', undefined, auth)).body.certificates[0];
    assert.equal((await request('agent/receipts', 'POST', { certificateId: item.id, version: item.version, status: 'installed', fingerprint: 'wrong' }, auth)).status, 422);
    assert.equal((await request('agent/receipts', 'POST', { certificateId: item.id, version: item.version, status: 'installed', fingerprint: item.fingerprint }, auth)).status, 204);
    const state = (await request('admin/state')).body;
    const serialized = JSON.stringify(state); assert(!serialized.includes(identity.agent_token)); assert(!serialized.includes('tokenHash')); assert(!serialized.includes('codeHash')); assert(!serialized.includes('PRIVATE KEY'));
  });
  await check('failed issuance preserves previous usable release', async () => {
    const previous = app.store.state.certificates[0].version;
    timestamp += 60001; failIssue = true;
    assert.equal((await request(`admin/certificates/${certificate.body.id}/issue`, 'POST', {})).status, 202); await app.idle();
    assert.equal(app.store.state.certificates[0].version, previous); assert.equal(app.store.state.jobs[0].status, 'failed');
    assert(!JSON.stringify(app.publicState()).includes('SECRET-DO-NOT-LOG'));
  });
  await check('production promotion and staging cannot replace production release', async () => {
    failIssue = false; timestamp += 60001;
    const settings = { ...app.store.state.settings, staging: false };
    assert.equal((await request('admin/settings', 'PATCH', settings)).status, 200);
    await app.checkRenewals(); await app.idle();
    // The preceding failed automatic attempt may be inside the automatic cooldown;
    // explicit issuance is allowed after its shorter manual cooldown.
    if (app.store.state.certificates[0].staging) { timestamp += 60001; await app.enqueue(certificate.body.id); await app.idle(); }
    assert.equal(app.store.state.certificates[0].staging, false);
    const productionVersion = app.store.state.certificates[0].version;
    assert.equal((await request('admin/settings', 'PATCH', { ...settings, staging: true })).status, 200);
    timestamp += 60001; await app.enqueue(certificate.body.id); await app.idle();
    assert.equal(app.store.state.certificates[0].version, productionVersion); assert(app.store.state.certificates[0].lastStagingResult);
  });
  await check('revoking certificate authorization immediately removes download access', async () => {
    assert.equal((await request(`admin/agents/${identity.agent_id}/permissions`, 'POST', { certificateIds: [] })).status, 204);
    assert.equal((await request('agent/manifest', 'GET', undefined, auth)).body.certificates.length, 0);
    const version = app.store.state.certificates[0].version;
    assert.equal((await request(`agent/certificates/${certificate.body.id}/${version}`, 'GET', undefined, auth)).status, 403);
  });
  await check('revoke identity blocks subsequent heartbeat', async () => {
    assert.equal((await request(`admin/agents/${identity.agent_id}/revoke`, 'POST', {})).status, 204);
    assert.equal((await request('agent/heartbeat', 'POST', {}, auth)).status, 401);
  });
  await check('restart preserves encrypted state and invalidates sessions', async () => {
    await app.close(); app = null; await start(); base = `http://127.0.0.1:${app.server.address().port}`;
    assert.equal((await request('admin/state')).status, 401); await login(); assert.equal((await request('admin/state')).body.agents.length, 2);
  });
  await check('logout invalidates session', async () => { assert.equal((await request('auth/logout', 'POST', {})).status, 204); assert.equal((await request('admin/state')).status, 401); });
  await check('password change invalidates all sessions and preserves master key', async () => {
    await login(); const key = await readFile(path.join(directory, 'master.key'));
    assert.equal((await request('admin/password', 'POST', { currentPassword: 'test-only-long-administrator-password', newPassword: 'changed-test-only-long-password' })).status, 204);
    assert.equal((await request('admin/state')).status, 401);
    assert.equal((await request('auth/login', 'POST', { password: 'test-only-long-administrator-password' })).status, 401);
    assert.equal((await request('auth/login', 'POST', { password: 'changed-test-only-long-password' })).status, 200);
    assert((await readFile(path.join(directory, 'master.key'))).equals(key));
  });
  console.log(`${count} security and real-X509 checks passed`);
} finally { await app?.close(); await rm(directory, { recursive: true, force: true }); }
