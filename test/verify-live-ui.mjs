import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { Store, passwordHash } from '../server/security.mjs';
import { createApplication } from '../server/application.mjs';

const modulePath = process.env.JSDOM_MODULE ? pathToFileURL(process.env.JSDOM_MODULE).href : 'jsdom';
const { JSDOM, VirtualConsole } = await import(modulePath);
const directory = await mkdtemp(path.join(os.tmpdir(), 'certrelay-live-ui-'));
const store = await Store.load(directory); const admin = await passwordHash('UI-test-administrator-password');
await store.transaction(s => { s.admin = admin; }); await store.close();
const app = await createApplication({ directory, publicUrl: 'http://127.0.0.1:4173', allowLocalHttp: true, port: 0, schedule: false }); await app.listen();
const base = `http://127.0.0.1:${app.server.address().port}`;
const errors = [];
const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error.message));
const dom = new JSDOM(await readFile('index.html', 'utf8'), { url: 'http://127.0.0.1:4173/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
const { window } = dom; const doc = window.document; let cookie = '';
window.AbortSignal = AbortSignal;
window.fetch = async (url, options = {}) => {
  const response = await fetch(base + url, { ...options, headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}) } });
  const set = response.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  return response;
};
const pause = () => new Promise(resolve => setTimeout(resolve, 15));
async function until(test) { for (let i = 0; i < 200; i++) { if (test()) return; await pause(); } throw new Error('UI wait timed out'); }
const fill = (name, value) => { const input = doc.querySelector(`[name="${name}"]`); assert(input, name); input.value = value; };
const click = action => { const element = doc.querySelector(`[data-action="${action}"]`); assert(element, action); element.click(); };
const submit = id => doc.querySelector(`#${id}`).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const route = async page => { window.location.hash = page; await pause(); };
let count = 0; let regeneratedCode = '';
const check = async (name, fn) => { await fn(); count++; console.log(`PASS ${name}`); };
try {
  window.eval((await readFile('src/live-app.js', 'utf8')) + '\nwindow.__cleanupTestTimers = () => { clearInterval(liveRefreshTimer); clearInterval(invitationTimer); clearTimeout(timer); };');
  await until(() => doc.querySelector('#login-form'));
  await check('real unauthenticated login screen', async () => { assert(!doc.body.textContent.includes('DEMO')); assert(doc.body.textContent.includes('登录')); });
  await check('invalid password remains logged out', async () => { fill('password', 'wrong'); submit('login-form'); await until(() => doc.querySelector('#form-error')?.textContent); assert(doc.querySelector('#login-form')); });
  await check('login renders actual empty server state', async () => {
    fill('password', 'UI-test-administrator-password'); submit('login-form'); await until(() => doc.querySelector('.sidebar')); assert.equal(doc.querySelectorAll('.cert-table tbody tr').length, 0); assert(!doc.body.textContent.includes('演示数据'));
  });
  await check('real DNS secret form stores encrypted credential without displaying it again', async () => {
    await route('credentials'); click('add-credential'); fill('name', 'Cloudflare UI'); fill('token', 'CF_TEST_ONLY_FOR_UI_123456789'); submit('credential-form');
    await until(() => doc.querySelectorAll('.credential-card').length === 1);
    assert(!doc.body.innerHTML.includes('CF_TEST_ONLY_FOR_UI')); assert.equal(window.localStorage.length, 0);
  });
  await check('create actual certificate record, never pretend it is signed', async () => {
    await route('certificates'); click('add-certificate'); fill('domain', 'example.com'); submit('certificate-form');
    await until(() => doc.querySelectorAll('.cert-table tbody tr').length === 1);
    assert.match(doc.querySelector('.cert-table tbody tr').textContent, /待签发/);
    assert.equal(app.store.state.certificates.length, 1);
  });
  await check('real invitation has short expiry and no DEMO prefix', async () => {
    await route('clients'); click('add-client'); fill('name', 'ui-agent'); fill('label', '<img src=x onerror=alert(1)>'); submit('client-form');
    await until(() => doc.querySelector('#enrollment-code'));
    assert.match(doc.querySelector('#enrollment-link').textContent, /\/enroll\/[a-f0-9]{32}$/);
    assert.match(doc.querySelector('#enrollment-code').textContent, /^\d{4} \d{4}$/);
    assert.equal(doc.querySelectorAll('img').length, 0); assert.equal(app.store.state.invitations.length, 1);
    assert.equal(app.store.state.agents.length, 0); click('close');
  });
  await check('invitation revoke persists on server', async () => {
    click('revoke-invitation'); submit('confirmation-form'); await until(() => app.store.state.invitations[0].status === 'revoked'); await pause();
  });
  await check('real invitation regeneration replaces the revoked invitation', async () => {
    await until(() => !doc.querySelector('[role="dialog"]'));
    click('regenerate-invitation'); await until(() => doc.querySelector('#enrollment-code'));
    regeneratedCode = doc.querySelector('#enrollment-code').textContent.replace(/\s/g, '');
    assert.equal(app.store.state.invitations.length, 2); assert.equal(app.store.state.invitations[0].status, 'pending'); assert.equal(app.store.state.invitations[1].status, 'revoked'); click('close');
  });
  await check('registered client metadata is editable and old invitations cannot regenerate', async () => {
    const invitation = app.store.state.invitations[0];
    const claim = await fetch(`${base}/api/v1/enrollments/${invitation.id}/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: regeneratedCode, name: 'ui-agent-host', arch: 'amd64' }) });
    assert.equal(claim.status, 201);
    await until(() => app.store.state.agents.length === 1);
    await route('clients'); click('refresh'); await until(() => doc.querySelector('.client-card')?.textContent.includes('ui-agent'));
    const card = doc.querySelector('.client-card'); card.querySelector('[data-action="edit-agent"]').click();
    fill('name', 'ui-agent-renamed'); fill('label', 'Updated UI note'); submit('agent-form');
    await until(() => app.store.state.agents[0]?.name === 'ui-agent-renamed');
    const updatedCard = doc.querySelector('.client-card');
    assert(updatedCard.textContent.includes('ui-agent-renamed'));
    assert(updatedCard.textContent.includes('Updated UI note'));
    assert.equal(doc.querySelectorAll('[data-action="regenerate-invitation"]').length, 0);
  });
  await check('beginner help explains self-chosen passwords, distinct secrets and certificate paths', async () => {
    await until(() => !doc.querySelector('[role="dialog"]'));
    await route('docs');
    assert(doc.body.textContent.includes('至少 14 个字符'));
    assert(doc.body.textContent.includes('不是客户端令牌'));
    assert(doc.body.textContent.includes('certrelay reset-password'));
    assert(doc.body.textContent.includes('/etc/certrelay-certs/example.com/current/fullchain.pem'));
    assert(doc.body.textContent.includes('state.json'));
  });
  await check('mismatched password confirmation leaves the administrator unchanged', async () => {
    await route('settings'); click('change-password');
    const before = JSON.stringify(app.store.state.admin);
    fill('currentPassword', 'UI-test-administrator-password');
    fill('newPassword', 'UI-new-memorable-administrator-password');
    fill('confirmPassword', 'UI-another-memorable-administrator-password'); submit('password-form');
    await until(() => doc.querySelector('#password-form #form-error')?.textContent.includes('不一致'));
    assert.equal(JSON.stringify(app.store.state.admin), before);
  });
  await check('confirmed password change invalidates the old session and accepts the new self-chosen password', async () => {
    const oldCookie = cookie;
    const before = JSON.stringify({ certificates: app.store.state.certificates, credentials: app.store.state.credentials, agents: app.store.state.agents });
    fill('confirmPassword', 'UI-new-memorable-administrator-password'); submit('password-form');
    await until(() => doc.querySelector('#login-form'));
    const oldSession = await fetch(base + '/api/v1/auth/session', { headers: { Cookie: oldCookie } });
    assert.equal(oldSession.status, 401);
    assert.equal(JSON.stringify({ certificates: app.store.state.certificates, credentials: app.store.state.credentials, agents: app.store.state.agents }), before);
    fill('password', 'UI-new-memorable-administrator-password'); submit('login-form');
    await until(() => doc.querySelector('.sidebar'));
  });
  await check('logout clears session and requires login', async () => {
    await until(() => !doc.querySelector('[role="dialog"]')); click('logout'); await until(() => doc.querySelector('#login-form'));
    assert(!doc.querySelector('.sidebar')); assert.equal(window.localStorage.length, 0);
  });
  assert.deepEqual(errors, []);
  console.log(`${count} real-API UI checks passed; browser rendering is not covered by jsdom.`);
} finally {
  window.__cleanupTestTimers?.();
  window.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
