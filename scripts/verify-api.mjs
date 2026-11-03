import assert from 'node:assert/strict';

const base = process.env.CERTRELAY_URL || 'http://127.0.0.1:4173';
const post = async (pathname, body) => {
  const response = await fetch(`${base}${pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const name = `api-test-${Date.now().toString(36)}`;
const created = await post('/api/v1/admin/enrollments', { name, arch: 'arm64', label: 'API test' });
assert.equal(created.status, 201);
assert.match(created.body.enrollment_url, /\/enroll\//);
assert.match(created.body.code, /^\d{8}$/);
const page = await fetch(created.body.enrollment_url);
assert.equal(page.status, 200);
const pageText = await page.text();
assert.equal(pageText.includes(created.body.code), false);
const claim = await post(`/api/v1/enrollments/${created.body.invitation_id}/claim`, { code: created.body.code, arch: 'arm64' });
assert.equal(claim.status, 201);
assert.equal(claim.body.agent_token.length, 64);
const reused = await post(`/api/v1/enrollments/${created.body.invitation_id}/claim`, { code: created.body.code });
assert.equal(reused.status, 410);
assert.equal(reused.body.error.code, 'invitation_unavailable');
const heartbeat = await fetch(`${base}/api/v1/agent/heartbeat`, { method: 'POST', headers: { Authorization: `Bearer ${claim.body.agent_token}` } });
assert.equal(heartbeat.status, 204);
const invalid = await post('/api/v1/admin/enrollments', { name: `${name}-bad`, arch: 'amd64' });
const wrongCode = await post(`/api/v1/enrollments/${invalid.body.invitation_id}/claim`, { code: '00000000' });
assert.equal(wrongCode.status, 401);
console.log('API enrollment checks passed: link, hidden code, one-time claim, heartbeat, invalid code.');
