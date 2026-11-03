// Self-contained protocol verification; never changes a running deployment's state.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'certrelay-enrollment-test-'));
process.env.CERTRELAY_PORT = '0';
process.env.CERTRELAY_STATE_PATH = path.join(temporary, 'state.json');
await writeFile(process.env.CERTRELAY_STATE_PATH, JSON.stringify({
  settings: { publicUrl: 'https://enrollment.example.test', invitationTtlSeconds: 1, maxEnrollmentAttempts: 5 },
  invitations: [], agents: [], credentials: [],
}), { mode: 0o600 });
const { server } = await import('./dev-server.mjs');
if (!server.listening) await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const post = async (pathname, body = {}, token) => {
  const response = await fetch(base + pathname, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const create = async (name) => {
  const response = await post('/api/v1/admin/enrollments', { name });
  assert.equal(response.status, 201);
  assert.match(response.body.code, /^\d{8}$/);
  return response.body;
};
const claimPath = (invitation) => `/api/v1/enrollments/${invitation.invitation_id}/claim`;
try {
  const race = await create('concurrent-device');
  const page = await (await fetch(base + `/enroll/${race.invitation_id}`)).text();
  assert(!page.includes(race.code));
  const claims = await Promise.all(Array.from({ length: 8 }, () => post(claimPath(race), { code: race.code })));
  assert.equal(claims.filter(r => r.status === 201).length, 1);
  assert.equal(claims.filter(r => r.status === 410).length, 7);
  const token = claims.find(r => r.status === 201).body.agent_token;
  assert.equal((await post('/api/v1/agent/heartbeat', {}, token)).status, 204);
  assert.equal((await post('/api/v1/agent/heartbeat', {}, 'wrong-token')).status, 401);
  const locked = await create('locked-device');
  for (let i = 0; i < 5; i++) assert.equal((await post(claimPath(locked), { code: '00000000' })).status, 401);
  assert.equal((await post(claimPath(locked), { code: locked.code })).status, 410);
  const expired = await create('expired-device');
  await new Promise(resolve => setTimeout(resolve, 1100));
  const expiration = await post(claimPath(expired), { code: expired.code });
  assert.equal(expiration.status, 410);
  assert.equal(expiration.body.error.code, 'invitation_expired');
  const safe = await (await fetch(base + '/api/v1/admin/state')).text();
  assert(!safe.includes(token));
  assert(!safe.includes('token_hash'));
  assert(!safe.includes('code_hash'));
  const stored = JSON.parse(await readFile(process.env.CERTRELAY_STATE_PATH, 'utf8'));
  assert.equal(stored.agents.length, 1);
  assert.notEqual(stored.agents[0].token_hash, token);
  assert(stored.invitations.some(i => i.status === 'locked'));
  assert(stored.invitations.some(i => i.status === 'expired'));
  console.log('PASS: eight-way claim race; replay; five failures lock; expiration; heartbeat auth; redaction; persisted hashes');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true });
}
