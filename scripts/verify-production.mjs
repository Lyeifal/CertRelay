import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store, passwordHash } from '../server/security.mjs';
import { createApplication } from '../server/application.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'certrelay-production-'));
const store = await Store.load(directory);
const admin = await passwordHash('correct horse battery staple 2026');
await store.transaction(s => { s.admin = admin; s.settings = { ...s.settings, publicUrl: 'http://127.0.0.1:4173', email: 'admin@example.test', staging: true }; });
await store.close();
const fakeBundle = { domain: 'example.com', fullchain: 'FAKE_CHAIN', privateKey: 'FAKE_KEY' };
const app = await createApplication({ directory, publicUrl: 'http://127.0.0.1:4173', allowLocalHttp: true, port: 0, schedule: false,
  validator: bundle => ({ fingerprint: 'AA:BB', expiresAt: new Date(Date.now() + 864000000).toISOString(), issuedAt: new Date().toISOString(), issuer: 'TEST CA', fullchainHash: 'chain-hash', keyHash: 'key-hash' }),
  issuer: async () => ({ bundle: fakeBundle, workspace: { files: {} } }),
});
await app.listen();
const base = `http://127.0.0.1:${app.server.address().port}`;
const request = async (url, options = {}) => {
  const response = await fetch(base + url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  return { response, body: response.status === 204 ? null : await response.json().catch(() => ({})) };
};
try {
  let result = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) });
  assert.equal(result.response.status, 401);
  result = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ password: 'correct horse battery staple 2026' }) });
  assert.equal(result.response.status, 200); const cookie = result.response.headers.get('set-cookie'); const csrf = result.body.csrf;
  const adminHeaders = { Cookie: cookie, 'X-CSRF-Token': csrf };
  result = await request('/api/v1/admin/state', { headers: adminHeaders }); assert.equal(result.response.status, 200); assert.equal(result.body.credentials.length, 0);
  result = await request('/api/v1/admin/credentials', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: 'test-cloudflare', provider: 'cf', secret: { token: 'a'.repeat(32), zoneId: 'a'.repeat(32) } }) });
  assert.equal(result.response.status, 201); const credentialId = result.body.id;
  const stateOnDisk = await readFile(path.join(directory, 'state.json'), 'utf8'); assert(!stateOnDisk.includes('a'.repeat(32))); assert(!stateOnDisk.includes('token'));
  result = await request('/api/v1/admin/certificates', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ domain: '*.example.com', credentialId }) });
  assert.equal(result.response.status, 201); const certificateId = result.body.id;
  result = await request('/api/v1/admin/enrollments', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: 'test-agent', certificateIds: [certificateId], arch: 'amd64' }) });
  assert.equal(result.response.status, 201); const invitation = result.body;
  result = await request(`/api/v1/enrollments/${invitation.invitation_id}/claim`, { method: 'POST', body: JSON.stringify({ code: invitation.code, name: 'test-agent-host', arch: 'amd64' }) });
  assert.equal(result.response.status, 201); const identity = result.body;
  result = await request(`/api/v1/enrollments/${invitation.invitation_id}/claim`, { method: 'POST', body: JSON.stringify({ code: invitation.code }) }); assert.equal(result.response.status, 410);
  result = await request(`/api/v1/admin/agents/${identity.agent_id}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ name: 'renamed-agent', label: 'Updated note' }) }); assert.equal(result.response.status, 204);
  result = await request(`/api/v1/admin/enrollments/${invitation.invitation_id}/regenerate`, { method: 'POST', headers: adminHeaders, body: '{}' }); assert.equal(result.response.status, 409);
  result = await request('/api/v1/admin/state', { headers: adminHeaders }); assert.equal(result.body.agents[0].name, 'renamed-agent'); assert.equal(result.body.agents[0].label, 'Updated note');
  result = await request('/api/v1/agent/manifest', { headers: { Authorization: `Bearer ${identity.agent_token}` } }); assert.equal(result.response.status, 200); assert.equal(result.body.certificates.length, 0);
  result = await request(`/api/v1/admin/certificates/${certificateId}/issue`, { method: 'POST', headers: adminHeaders, body: '{}' }); assert.equal(result.response.status, 202);
  await app.idle();
  result = await request('/api/v1/admin/state', { headers: adminHeaders }); assert.equal(result.response.status, 200); assert.equal(result.body.certificates[0].version?.length, 32); assert.equal(result.body.jobs[0].status, 'succeeded');
  result = await request('/api/v1/agent/manifest', { headers: { Authorization: `Bearer ${identity.agent_token}` } }); assert.equal(result.body.certificates.length, 1); assert.equal(result.body.certificates[0].fingerprint, 'AA:BB');
  result = await request('/api/v1/agent/receipts', { method: 'POST', headers: { Authorization: `Bearer ${identity.agent_token}` }, body: JSON.stringify({ certificateId, version: result.body.certificates[0].version, status: 'installed', fingerprint: 'AA:BB' }) }); assert.equal(result.response.status, 204);
  result = await request('/api/v1/admin/state', { headers: adminHeaders }); assert.equal(result.body.agents[0].receipts[certificateId].status, 'installed');
  assert.equal((await request('/api/v1/admin/state')).response.status, 401);
  console.log('PASS: admin login/CSRF; encrypted DNS credential; certificate issue job; one-time enrollment; authorization manifest; install receipt; unauthenticated admin rejection');
} finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
