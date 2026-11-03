import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const playwright = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { chromium } = await import(playwright);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
const externalRequests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url()); });
let checks = 0;
async function check(label, fn) { await fn(); checks++; console.log(`PASS ${label}`); }
const dialog = () => page.getByRole('dialog');
const close = () => dialog().getByRole('button', { name: '关闭', exact: true }).click();
await mkdir('artifacts', { recursive: true });

try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await check('overview certificate rows', async () => assert.equal(await page.locator('.cert-table tbody tr').count(), 5));
  await check('demo environment is identified', async () => assert.equal(await page.getByText('演示数据', { exact: true }).count(), 1));
  await page.screenshot({ path: 'artifacts/overview-desktop.png', fullPage: true });
  await check('offline target never reports false success', async () => {
    await page.locator('.attention-panel button').click();
    assert.match(await dialog().innerText(), /dell-ubuntu/);
    await dialog().getByRole('button', { name: '重新分发' }).click();
    assert.match(await page.locator('.attention-panel').innerText(), /1 项等待同步/);
  });
  await page.goto('http://127.0.0.1:4173/#certificates');
  await check('provider filter', async () => {
    await page.getByRole('button', { name: 'Cloudflare', exact: true }).click();
    assert.equal(await page.locator('.cert-table tbody tr').count(), 2);
  });
  await check('domain search and empty state', async () => {
    await page.getByRole('button', { name: '全部证书', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜索域名' }).fill('example.cn');
    assert.equal(await page.locator('.cert-table tbody tr').count(), 1);
    await page.getByRole('searchbox', { name: '搜索域名' }).fill('does-not-exist');
    assert.match(await page.locator('#certificate-list').innerText(), /没有找到匹配/);
    await page.getByRole('searchbox', { name: '搜索域名' }).fill('');
  });
  await page.screenshot({ path: 'artifacts/certificates-desktop.png', fullPage: true });
  await check('duplicate domain is rejected', async () => {
    await page.getByRole('button', { name: '添加证书', exact: true }).click();
    await dialog().locator('input[name="domain"]').fill('example.com');
    await dialog().getByRole('button', { name: '添加域名', exact: true }).click();
    assert.match(await dialog().locator('#form-error').innerText(), /已经在管理列表/);
    await close();
  });
  await check('new domain remains pending; no false issuance', async () => {
    await page.getByRole('button', { name: '添加证书', exact: true }).click();
    await dialog().locator('input[name="domain"]').fill('preview.example');
    await dialog().getByRole('button', { name: '添加域名', exact: true }).click();
    const row = page.locator('.cert-table tbody tr').filter({ hasText: '*.preview.example' });
    assert.match(await row.innerText(), /待签发/);
    await row.locator('.domain-name').click();
    assert.equal(await dialog().getByRole('button', { name: '重新分发' }).isDisabled(), true);
    await close();
  });
  await check('global search keyboard shortcut and Escape', async () => {
    await page.keyboard.press('Control+k');
    await dialog().getByRole('textbox').fill('home-lab');
    assert.equal(await dialog().locator('.search-result').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await dialog().count(), 0);
  });
  await page.goto('http://127.0.0.1:4173/#clients');
  await page.screenshot({ path: 'artifacts/clients-desktop.png', fullPage: true });
  await check('client status filter', async () => {
    await page.getByRole('button', { name: '离线 1', exact: true }).click();
    assert.equal(await page.locator('.client-card').count(), 1);
    await page.getByRole('button', { name: '全部 6', exact: true }).click();
  });
  await check('authorization can be removed without deleting a client', async () => {
    await page.locator('.client-card').filter({ hasText: 'dell-ubuntu' }).getByRole('button', { name: '管理授权' }).click();
    await dialog().locator('input[value="cert-5"]').uncheck();
    await dialog().getByRole('button', { name: '保存授权' }).click();
    assert.match(await page.locator('.client-card').filter({ hasText: 'dell-ubuntu' }).innerText(), /0 张/);
    assert.equal(await page.locator('.client-card').count(), 6);
  });
  await check('client enrollment and safe rendering of user text', async () => {
    await page.getByRole('button', { name: '登记客户端', exact: true }).click();
    await dialog().locator('input[name="name"]').fill('arm-lab-01');
    await dialog().locator('input[name="label"]').fill('<img src=x onerror=alert(1)>');
    await dialog().locator('select[name="arch"]').selectOption('arm64');
    await dialog().getByRole('button', { name: '生成登记链接' }).click();
    assert.match(await dialog().locator('#enrollment-link').innerText(), /^https:\/\/certs\.example\.com\/enroll\/DEMO-/);
    assert.match(await dialog().locator('#enrollment-code').innerText(), /^\d{4} \d{4}$/);
    assert.equal(await dialog().locator('img').count(), 0);
    await dialog().getByRole('button', { name: '稍后配置' }).click();
    assert.equal(await page.locator('.client-card').count(), 7);
    assert.equal(await page.locator('.client-card img').count(), 0);
  });
  await page.goto('http://127.0.0.1:4173/#activity');
  await check('activity filtering', async () => {
    await page.getByRole('button', { name: '需要关注', exact: true }).click();
    assert.equal(await page.locator('.activity-item:not(:has(.activity-symbol.warning))').count(), 0);
  });
  await page.goto('http://127.0.0.1:4173/#credentials');
  await page.screenshot({ path: 'artifacts/credentials-desktop.png', fullPage: true });
  await check('DNS keys are not accepted in an unconnected prototype', async () => {
    await page.getByRole('button', { name: '添加 DNS 凭据', exact: true }).click();
    assert.equal(await dialog().locator('input[type="password"]:disabled').count(), 2);
    await close();
  });
  await page.goto('http://127.0.0.1:4173/#settings');
  await page.screenshot({ path: 'artifacts/settings-desktop.png', fullPage: true });
  await check('preview settings persist across reload', async () => {
    await page.getByLabel('客户端检查间隔', { exact: true }).selectOption('30');
    await page.getByRole('button', { name: '保存设置' }).click();
    await page.reload();
    assert.equal(await page.getByLabel('客户端检查间隔', { exact: true }).inputValue(), '30');
  });
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://127.0.0.1:4173/');
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/overview-mobile.png', fullPage: true });
  await check('mobile page has no horizontal overflow', async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true));
  await check('mobile navigation', async () => {
    await page.getByRole('button', { name: '打开导航' }).click();
    await page.getByRole('link', { name: '客户端', exact: true }).click();
    assert.equal(await page.locator('.sidebar.open').count(), 0);
    assert.equal(await page.locator('.client-card').count(), 6);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
  await check('mobile form fits viewport', async () => {
    await page.getByRole('button', { name: '登记客户端', exact: true }).click();
    const bounds = await dialog().boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.keyboard.press('Escape');
  });
  await check('no browser errors', async () => assert.deepEqual(errors, []));
  await check('no external requests or font dependencies', async () => assert.deepEqual(externalRequests, []));
  console.log(`\n${checks} checks passed. Screenshots saved to artifacts/.`);
} finally {
  await browser.close();
}
