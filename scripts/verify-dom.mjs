import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.JSDOM_MODULE ? pathToFileURL(process.env.JSDOM_MODULE).href : 'jsdom';
const { JSDOM } = await import(modulePath);
const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://127.0.0.1:4173/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.scrollTo = () => {};
window.crypto.randomUUID = () => webcrypto.randomUUID();
window.eval(source);
const doc = window.document;
let checks = 0;
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
const click = (selector, parent = doc) => { const element = parent.querySelector(selector); assert.ok(element, `Missing ${selector}`); element.click(); };
const dialog = () => doc.querySelector('[role="dialog"]');
const fill = (selector, value) => { const field = doc.querySelector(selector); assert.ok(field, selector); field.value = value; field.dispatchEvent(new window.Event('input', { bubbles: true })); };
const submit = (id) => doc.querySelector(`#${id}`).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const close = () => click('[data-action="close-overlay"]');
const route = async (page) => { window.location.hash = page; await tick(); };
async function check(label, fn) { await fn(); checks++; console.log(`PASS ${label}`); }

try {
  await check('initial overview and fixture counts', () => {
    assert.equal(doc.querySelectorAll('.cert-table tbody tr').length, 5);
    assert.equal(doc.querySelectorAll('.metric').length, 4);
    assert.equal(doc.querySelector('.preview-badge').textContent, '演示数据');
    assert.match(doc.querySelector('.attention-panel').textContent, /1 项等待同步/);
  });
  await check('offline assignment stays pending after retry', () => {
    click('.attention-panel [data-action="certificate-detail"]');
    assert.match(dialog().textContent, /dell-ubuntu/);
    click('[data-action="distribute"]', dialog());
    assert.match(doc.querySelector('.attention-panel').textContent, /1 项等待同步/);
  });
  await check('navigation and domain search', async () => {
    await route('certificates');
    assert.match(doc.title, /域名证书/);
    fill('#certificate-search', 'example.cn');
    assert.equal(doc.querySelectorAll('.cert-table tbody tr').length, 1);
    fill('#certificate-search', 'no-matches');
    assert.match(doc.querySelector('#certificate-list').textContent, /没有找到匹配/);
    fill('#certificate-search', '');
  });
  await check('DNS provider filters', () => {
    click('[data-action="provider-filter"][data-value="cf"]');
    assert.equal(doc.querySelectorAll('.cert-table tbody tr').length, 2);
    click('[data-action="provider-filter"][data-value="ali"]');
    assert.equal(doc.querySelectorAll('.cert-table tbody tr').length, 3);
    click('[data-action="provider-filter"][data-value="all"]');
  });
  await check('duplicate domain rejected', () => {
    click('[data-action="add-certificate"]');
    fill('input[name="domain"]', '*.EXAMPLE.COM.');
    submit('certificate-form');
    assert.match(doc.querySelector('#form-error').textContent, /已经在管理列表/);
    close();
  });
  await check('invalid URL rejected', () => {
    click('[data-action="add-certificate"]');
    fill('input[name="domain"]', 'https://example.com/path');
    submit('certificate-form');
    assert.match(doc.querySelector('#form-error').textContent, /不要包含协议/);
    close();
  });
  await check('adding a domain does not pretend to issue a certificate', () => {
    click('[data-action="add-certificate"]');
    fill('input[name="domain"]', 'preview.example');
    submit('certificate-form');
    assert.equal(dialog(), null);
    assert.equal(doc.querySelectorAll('.cert-table tbody tr').length, 6);
    const row = [...doc.querySelectorAll('tbody tr')].find((element) => element.textContent.includes('*.preview.example'));
    assert.match(row.textContent, /待签发/);
    click('[data-action="certificate-detail"]', row);
    assert.equal(dialog().querySelector('[data-action="distribute"]').disabled, true);
    close();
  });
  await check('global search and Escape', () => {
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    fill('#global-search', 'home-lab');
    assert.equal(dialog().querySelectorAll('.search-result').length, 1);
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(dialog(), null);
  });
  await check('client filters', async () => {
    await route('clients');
    assert.equal(doc.querySelectorAll('.client-card').length, 6);
    click('[data-action="client-filter"][data-value="offline"]');
    assert.equal(doc.querySelectorAll('.client-card').length, 1);
    click('[data-action="client-filter"][data-value="all"]');
  });
  await check('revoking authorization retains the device', () => {
    click('[data-action="client-detail"][data-id="dell-ubuntu"]');
    dialog().querySelector('input[value="cert-5"]').checked = false;
    submit('authorization-form');
    assert.equal(doc.querySelectorAll('.client-card').length, 6);
    click('[data-action="client-detail"][data-id="dell-ubuntu"]');
    assert.equal(dialog().querySelector('input[value="cert-5"]').checked, false);
    close();
  });
  await check('enrollment separates the demo link and code, and escapes text', () => {
    click('[data-action="add-client"]');
    fill('input[name="name"]', 'arm-lab-01');
    fill('input[name="label"]', '<img src=x onerror=alert(1)>');
    doc.querySelector('select[name="arch"]').value = 'arm64';
    submit('client-form');
    const link = dialog().querySelector('#enrollment-link').textContent;
    const code = dialog().querySelector('#enrollment-code').textContent;
    assert.match(link, /^https:\/\/certs\.example\.com\/enroll\/DEMO-[a-f0-9]{32}$/);
    assert.match(code, /^\d{4} \d{4}$/);
    assert.equal(link.includes(code.replace(' ', '')), false);
    assert.equal(dialog().querySelector('#enrollment-command').textContent, 'certrelay-agent enroll');
    assert.match(dialog().textContent, /仅成功使用一次/);
    assert.equal(dialog().querySelectorAll('img').length, 0);
    close();
    assert.equal(doc.querySelectorAll('.client-card').length, 7);
    assert.equal(doc.querySelectorAll('.client-card img').length, 0);
    assert.match(doc.querySelector('.client-grid').textContent, /<img src=x onerror=alert\(1\)>/);
  });
  await check('viewing an invitation does not renew it; regeneration replaces its ID', () => {
    const openPending = () => [...doc.querySelectorAll('.client-card')].find((card) => card.textContent.includes('arm-lab-01')).querySelector('[data-action="client-detail"]').click();
    openPending(); click('[data-action="view-enrollment"]');
    const link = dialog().querySelector('#enrollment-link').textContent;
    const expiresAt = dialog().querySelector('#invitation-countdown').dataset.expiresAt;
    close(); openPending(); click('[data-action="view-enrollment"]');
    assert.equal(dialog().querySelector('#enrollment-link').textContent, link);
    assert.equal(dialog().querySelector('#invitation-countdown').dataset.expiresAt, expiresAt);
    click('[data-action="regenerate-enrollment"]');
    assert.notEqual(dialog().querySelector('#enrollment-link').textContent, link);
    close();
  });
  await check('revoking a demo invitation disables copying without registering a device', () => {
    [...doc.querySelectorAll('.client-card')].find((card) => card.textContent.includes('arm-lab-01')).querySelector('[data-action="client-detail"]').click();
    click('[data-action="view-enrollment"]');
    click('[data-action="revoke-enrollment"]');
    assert.equal(dialog().querySelector('#invitation-countdown').textContent, '已撤销');
    assert.equal(dialog().querySelector('[data-action="copy-code"]').disabled, true);
    assert.equal(dialog().querySelector('[data-action="copy-enrollment-link"]').disabled, true);
    assert.equal(dialog().querySelector('#enrollment-code').textContent, '已失效');
    close();
    assert.match([...doc.querySelectorAll('.client-card')].find((card) => card.textContent.includes('arm-lab-01')).textContent, /待登记/);
  });
  await check('expired demo invitation stays expired instead of being silently renewed', () => {
    const openPending = () => [...doc.querySelectorAll('.client-card')].find((card) => card.textContent.includes('arm-lab-01')).querySelector('[data-action="client-detail"]').click();
    openPending(); click('[data-action="view-enrollment"]'); click('[data-action="regenerate-enrollment"]');
    const link = dialog().querySelector('#enrollment-link').textContent;
    const expiresAt = Number(dialog().querySelector('#invitation-countdown').dataset.expiresAt);
    close();
    const originalNow = window.Date.now;
    window.Date.now = () => expiresAt + 1;
    try {
      openPending(); click('[data-action="view-enrollment"]');
      assert.equal(dialog().querySelector('#enrollment-link').textContent, link);
      assert.equal(dialog().querySelector('#invitation-countdown').textContent, '已过期');
      assert.equal(dialog().querySelector('[data-action="copy-code"]').disabled, true);
      close();
    } finally { window.Date.now = originalNow; }
  });
  await check('duplicate client name rejected', () => {
    click('[data-action="add-client"]');
    fill('input[name="name"]', 'ARM-LAB-01');
    submit('client-form');
    assert.match(doc.querySelector('#form-error').textContent, /已经存在/);
    close();
  });
  await check('new authorization begins pending and cannot bypass offline state', () => {
    const clientButton = [...doc.querySelectorAll('.client-card')].find((card) => card.textContent.includes('arm-lab-01')).querySelector('[data-action="client-detail"]');
    clientButton.click();
    dialog().querySelector('input[value="cert-1"]').checked = true;
    submit('authorization-form');
    assert.match([...doc.querySelectorAll('.client-card')].find((card) => card.textContent.includes('arm-lab-01')).textContent, /1 项待更新/);
  });
  await check('renewal requires an explicit simulation step', async () => {
    await route('certificates');
    click('[data-action="certificate-detail"][data-id="cert-1"]');
    click('[data-action="renew-certificate"]', dialog());
    assert.match(dialog().textContent, /不会联系 CA/);
    click('[data-action="confirm-renew"]', dialog());
    assert.match(dialog().textContent, /剩余 90 天/);
    assert.equal(dialog().querySelectorAll('.detail-client .badge.warning').length, 5);
    click('[data-action="distribute"]', dialog());
    click('[data-action="certificate-detail"][data-id="cert-1"]');
    assert.equal(dialog().querySelectorAll('.detail-client .badge.warning').length, 1);
    close();
  });
  await check('activity filters render only the requested event type', async () => {
    await route('activity');
    click('[data-action="log-filter"][data-value="warning"]');
    const list = doc.querySelectorAll('.activity-symbol');
    assert.ok(list.length > 0);
    assert.ok([...list].every((element) => element.classList.contains('warning')));
  });
  await check('preview settings are saved locally', async () => {
    await route('settings');
    doc.querySelector('#check-interval').value = '30';
    doc.querySelector('#auto-deploy').checked = false;
    submit('settings-form');
    const saved = JSON.parse(window.localStorage.getItem('certrelay-ui-settings'));
    assert.equal(saved.interval, '30');
    assert.equal(saved.autoDeploy, false);
    assert.match(doc.querySelector('#toast-root').textContent, /未更改服务器配置/);
  });
  await check('server address requires a clean HTTPS origin', () => {
    const saved = window.localStorage.getItem('certrelay-ui-settings');
    for (const invalid of ['http://certs.example.com', 'https://user:pass@certs.example.com', 'https://certs.example.com/path', 'https://certs.example.com?token=abc', 'https://certs.example.com/#fragment']) {
      fill('#public-url', invalid); submit('settings-form');
      assert.match(doc.querySelector('#settings-error').textContent, /HTTPS/);
      assert.equal(window.localStorage.getItem('certrelay-ui-settings'), saved);
    }
    fill('#public-url', 'https://new-center.example:9443/'); submit('settings-form');
    assert.equal(JSON.parse(window.localStorage.getItem('certrelay-ui-settings')).publicUrl, 'https://new-center.example:9443');
  });
  await check('new invitations use the configured origin, never the preview HTTP origin', async () => {
    await route('clients');
    [...doc.querySelectorAll('.client-card')].find((card) => card.textContent.includes('arm-lab-01')).querySelector('[data-action="client-detail"]').click();
    click('[data-action="view-enrollment"]'); click('[data-action="regenerate-enrollment"]');
    assert.match(dialog().querySelector('#enrollment-link').textContent, /^https:\/\/new-center\.example:9443\/enroll\/DEMO-/);
    close();
  });
  await check('DNS credentials page shows masked metadata and no verified claim', async () => {
    await route('credentials');
    assert.match(doc.title, /DNS 凭据/);
    assert.equal(doc.querySelectorAll('.credential-card').length, 2);
    assert.ok([...doc.querySelectorAll('.credential-card .badge')].every((element) => element.textContent === '示例 · 未验证'));
    click('[data-action="inspect-credential"]');
    assert.match(doc.querySelector('#toast-root').textContent, /未验证真实密钥/);
  });
  await check('referenced credentials cannot be deleted', () => {
    click('[data-action="edit-credential"][data-id="dns-cf-main"]');
    assert.ok([...dialog().querySelectorAll('input[type="password"]')].every((field) => field.disabled));
    click('[data-action="delete-credential"]');
    assert.match(dialog().textContent, /仍在使用/);
    assert.equal(dialog().querySelector('[data-action="confirm-delete-credential"]'), null);
    close();
  });
  await check('credential form supports platform fields without accepting secrets', () => {
    click('[data-action="add-credential"]');
    fill('input[name="name"]', '阿里云第二账户');
    const provider = dialog().querySelector('select[name="provider"]');
    provider.value = 'ali'; provider.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(dialog().querySelectorAll('input[type="password"]').length, 2);
    assert.ok([...dialog().querySelectorAll('input[type="password"]')].every((field) => field.disabled && !field.name));
    fill('input[name="note"]', '<img src=x onerror=alert(1)>');
    submit('credential-form');
    assert.equal(doc.querySelectorAll('.credential-card').length, 3);
    assert.equal(doc.querySelectorAll('.credential-card img').length, 0);
    assert.equal(window.localStorage.getItem('certrelay-ui-settings').includes('阿里云第二账户'), false);
  });
  await check('duplicate credential name is rejected', () => {
    click('[data-action="add-credential"]');
    fill('input[name="name"]', '阿里云第二账户'); submit('credential-form');
    assert.match(doc.querySelector('#form-error').textContent, /名称已经存在/);
    close();
  });
  await check('certificate credentials follow the selected DNS provider', async () => {
    await route('certificates'); click('[data-action="add-certificate"]');
    const provider = dialog().querySelector('#certificate-provider');
    provider.value = 'ali'; provider.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(dialog().querySelector('#certificate-credential').options.length, 2);
    assert.match(dialog().querySelector('#certificate-credential').textContent, /阿里云第二账户/);
    const credentialSelect = dialog().querySelector('#certificate-credential');
    credentialSelect.append(new window.Option('wrong provider', 'dns-cf-main'));
    credentialSelect.value = 'dns-cf-main';
    fill('input[name="domain"]', 'wrong-provider.example'); submit('certificate-form');
    assert.match(doc.querySelector('#form-error').textContent, /平台一致/);
    close();
  });
  await check('unreferenced demo credentials can be deleted', async () => {
    await route('credentials');
    [...doc.querySelectorAll('.credential-card')].find((card) => card.textContent.includes('阿里云第二账户')).querySelector('[data-action="edit-credential"]').click();
    click('[data-action="delete-credential"]'); click('[data-action="confirm-delete-credential"]');
    assert.equal(doc.querySelectorAll('.credential-card').length, 2);
  });
  await check('mobile navigation can be opened and dismissed', () => {
    click('[data-action="toggle-menu"]');
    assert.ok(doc.querySelector('.sidebar.open'));
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.querySelector('.sidebar.open'), null);
  });
  await check('help describes prototype scope', () => {
    click('[data-action="help"]');
    assert.match(dialog().textContent, /尚未实现真实签发、鉴权和分发/);
    close();
  });
  console.log(`\n${checks} DOM interaction checks passed. These do not validate browser layout or rendering.`);
} finally {
  window.close();
}
