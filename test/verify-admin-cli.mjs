import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { dataDirectoryFromEnv, resolveDataDirectory, parseAdminArgs, changeStoredPassword } from '../shared/admin-cli.mjs';
import { describePaths } from '../shared/paths-cli.mjs';
import { prompt } from '../shared/prompt.mjs';
import { Store, passwordHash } from '../server/security.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'certrelay-admin-cli-'));
let count = 0;
const check = async (name, fn) => { await fn(); count++; console.log(`PASS ${name}`); };
const password = 'test-only-memorable-long-password';
const data = path.join(root, 'vault');
const executeCLI = (args, input = '') => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.resolve('scripts/certrelay.mjs'), ...args], { env: { ...process.env, CERTRELAY_DATA_DIR: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  child.stdin.on('error', e => { if (e.code !== 'EPIPE') reject(e); });
  child.once('error', reject); child.once('exit', code => resolve({ code, output })); child.stdin.end(input);
});
try {
  await check('literal environment path parser never evaluates shell input', async () => {
    assert.equal(dataDirectoryFromEnv(`OTHER=hidden\nCERTRELAY_DATA_DIR="${root.replaceAll('\\', '\\\\')}"\n`), root);
    assert.equal(dataDirectoryFromEnv(`CERTRELAY_DATA_DIR='${root}'`), root);
    assert.equal(dataDirectoryFromEnv('OTHER=hidden'), null);
    assert.throws(() => dataDirectoryFromEnv('CERTRELAY_DATA_DIR=relative/path'), /绝对/);
    assert.throws(() => dataDirectoryFromEnv('CERTRELAY_DATA_DIR="/tmp/a"; touch /tmp/not-executed'), /格式/);
    assert.throws(() => parseAdminArgs(['--password', password]), /命令行/);
    assert.throws(() => parseAdminArgs(['--data-dir']), /用法/);
    assert.equal(parseAdminArgs(['--data-dir='+root])['data-dir'], root);
  });
  await check('data directory precedence: explicit, env, installed server.env, development cwd', async () => {
    const envFile = path.join(root, 'server.env');
    await writeFile(envFile, `CERTRELAY_DATA_DIR="${data.replaceAll('\\', '\\\\')}"\n`);
    assert.equal(await resolveDataDirectory({}, { env: {}, envFile, cwd: root }), data);
    assert.equal(await resolveDataDirectory({}, { env: { CERTRELAY_DATA_DIR: root }, envFile, cwd: root }), root);
    assert.equal(await resolveDataDirectory({ 'data-dir': data }, { env: { CERTRELAY_DATA_DIR: root }, envFile, cwd: root }), data);
    assert.equal(await resolveDataDirectory({}, { env: {}, envFile: path.join(root, 'missing.env'), cwd: root }), path.join(root, 'data'));
  });
  await check('hidden prompt supports confirmation without destroying input or echoing secrets', async () => {
    const input = new PassThrough(); const output = new PassThrough(); let echoed = '';
    input.isTTY = true; input.setRawMode = value => { input.isRaw = value; };
    output.on('data', b => { echoed += b; });
    const first = prompt('new:', true, { input, output }); input.write('first-secret\r'); assert.equal(await first, 'first-secret');
    assert.equal(input.destroyed, false); assert.equal(input.isRaw, false);
    const second = prompt('again:', true, { input, output }); input.write('first-secret\r'); assert.equal(await second, 'first-secret');
    assert(!echoed.includes('first-secret'));
    const cancelled = prompt('cancel:', true, { input, output }); input.write('\u0003'); await assert.rejects(cancelled, /Cancelled/);
    assert.equal(input.isRaw, false); assert.equal(input.listenerCount('data'), 0); input.destroy(); output.destroy();
  });
  await check('reset missing state is refused without creating a replacement vault', async () => {
    const missing = path.join(root, 'no-vault');
    await assert.rejects(changeStoredPassword('reset', missing, password), /state.json/);
    await assert.rejects(readFile(path.join(missing, 'master.key')), { code: 'ENOENT' });
    const result = await executeCLI(['reset-password', '--data-dir', missing], password);
    assert.equal(result.code, 1); assert(!result.output.includes(password));
    await assert.rejects(readFile(path.join(missing, 'master.key')), { code: 'ENOENT' });
  });
  await check('init-admin CLI accepts a self-chosen password and refuses accidental reinitialization', async () => {
    const result = await executeCLI(['init-admin', '--data-dir', data], password+'\n');
    assert.equal(result.code, 0, result.output); assert(!result.output.includes(password));
    const state = JSON.parse(await readFile(path.join(data, 'state.json'), 'utf8'));
    assert.equal(state.admin.digest, (await passwordHash(password, state.admin.salt)).digest);
    const before = await readFile(path.join(data, 'master.key'));
    await assert.rejects(changeStoredPassword('init', data, password), /已设置/);
    assert.deepEqual(await readFile(path.join(data, 'master.key')), before);
  });
  await check('offline reset changes only admin/audit and preserves vault key, encrypted data and identities', async () => {
    const s = await Store.load(data);
    await s.transaction(next => { next.credentials.push({ id: 'test-credential', secret: s.vault.seal({ token: 'test-not-a-live-token' }, 'test') }); next.agents.push({ id: 'test-agent' }); next.certificates.push({ id: 'test-certificate' }); });
    await s.close();
    const before = JSON.parse(await readFile(path.join(data, 'state.json'), 'utf8'));
    const key = await readFile(path.join(data, 'master.key'));
    const changed = await executeCLI(['reset-password', '--data-dir', data], 'another-test-only-long-password\n');
    assert.equal(changed.code, 0, changed.output);
    assert(!changed.output.includes('another-test-only-long-password'));
    const after = JSON.parse(await readFile(path.join(data, 'state.json'), 'utf8'));
    assert.notEqual(after.admin.digest, before.admin.digest);
    for (const field of ['credentials', 'certificates', 'agents', 'settings', 'keyCheck']) assert.deepEqual(after[field], before[field]);
    assert.deepEqual(await readFile(path.join(data, 'master.key')), key);
    assert.equal(after.events[0].action, 'admin_password_reset');
    await assert.rejects(changeStoredPassword('reset', data, 'too-short'), /14/);
  });
  await check('active server lock blocks CLI reset and is never deleted', async () => {
    const s = await Store.load(data);
    try {
      const before = await readFile(path.join(data, 'state.json'));
      const result = await executeCLI(['reset-password', '--data-dir', data], password);
      assert.equal(result.code, 1); assert.match(result.output, /systemctl stop certrelay/);
      assert.deepEqual(await readFile(path.join(data, 'state.json')), before);
      await readFile(path.join(data, 'server.lock'));
    } finally { await s.close(); }
  });
  await check('paths reads custom managed root and normalizes IDN without displaying secrets', async () => {
    const config = path.join(root, 'managed.json'); const directoryRoot = path.join(root, 'certificates');
    await writeFile(config, JSON.stringify({ mode: 'managed', directoryRoot, token: 'never-echo-this-test-token' }));
    const result = await describePaths({ config, domain: '*.例子.测试', 'data-dir': data });
    assert.equal(result.targets[0].certificate, path.join(directoryRoot, 'xn--fsqu00a.xn--0zwm56d/current/fullchain.pem'));
    assert(!JSON.stringify(result).includes('never-echo'));
    const cli = await executeCLI(['paths', '--config', config, '--domain', '例子.测试', '--data-dir', data]);
    assert.equal(cli.code, 0); assert(!cli.output.includes('never-echo'));
    await assert.rejects(describePaths({ config, domain: '../../escape' }), /根域名/);
  });
  await check('paths supports legacy mappings and missing configuration is labelled example only', async () => {
    const config = path.join(root, 'legacy.json'); const directory = path.join(root, 'legacy-cert');
    await writeFile(config, JSON.stringify({ certificates: [{ domain: 'example.com', directory }] }));
    const legacy = await describePaths({ config, domain: 'example.com', 'data-dir': data });
    assert.equal(legacy.targets[0].privateKey, path.join(directory, 'current/privkey.pem'));
    const missing = await describePaths({ config: path.join(root, 'missing.json'), 'data-dir': data });
    assert.equal(missing.configured, false); assert.equal(missing.targets[0].example, true);
  });
  console.log(`${count} admin CLI, path guidance and reusable hidden-prompt checks passed.`);
} finally { await rm(root, { recursive: true, force: true }); }
