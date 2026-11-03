import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createIssuer } from '../server/acme.mjs';
import { fixturePair } from './certificate-factory.mjs';

const fixtures = fixturePair(); const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'certrelay-acme-test-'));
const calls = []; let fail = false;
const execute = async (file, args, options) => {
  calls.push({ file, args, env: options.env });
  assert(!Object.keys(options.env).some(key => /PASSWORD|PROXY|TOKEN/.test(key) && key !== 'CF_Token'));
  const value = flag => args[args.indexOf(flag) + 1];
  const config = value('--config-home');
  if (args.includes('--register-account')) { await mkdir(path.join(config, 'ca'), { recursive: true }); await writeFile(path.join(config, 'ca/account.key'), 'PRIVATE ACCOUNT TEST KEY'); }
  if (args.includes('--issue')) {
    assert(args.includes('*.example.com')); assert(args.includes('ec-256'));
    await writeFile(path.join(config, 'account.conf'), `SAVED_WORKING_DIR='${options.env.HOME}'\nSAVED_CF_Token='${options.env.CF_Token || ''}'\n`);
    if (fail) throw new Error('SECRET SUBPROCESS OUTPUT');
  }
  if (args.includes('--install-cert')) {
    await writeFile(value('--fullchain-file'), fixtures.one.fullchain); await writeFile(value('--key-file'), fixtures.one.privateKey);
  }
};
const issuer = createIssuer({ acmePath: path.resolve('test/acme.sh'), tempRoot, execute, platform: 'linux' });
const request = { certificate: { domain: 'example.com' }, credential: { provider: 'cf', secret: { token: 'CF_TEST_ONLY_123456789', zoneId: 'a'.repeat(32) } }, settings: { staging: true, email: 'admin@example.test' } };
try {
  const first = await issuer(request);
  assert.equal(calls.length, 3); assert.equal(calls[1].env.CF_Token, request.credential.secret.token); assert(calls[1].args.includes('dns_cf'));
  assert(calls[1].args.includes('https://acme-staging-v02.api.letsencrypt.org/directory'));
  assert.equal(first.bundle.fullchain, fixtures.one.fullchain);
  assert(first.workspace.files['config/ca/account.key']);
  assert.equal((await readdir(tempRoot)).length, 0);
  console.log('PASS DNS plugin argv, scoped env, staging CA, key/chain validation, workspace snapshot and cleanup');
  calls.length = 0;
  await issuer({ ...request, savedWorkspace: first.workspace, credential: { provider: 'ali', secret: { accessKeyId: 'TEST_KEY', accessKeySecret: 'TEST_SECRET' } } });
  assert.equal(calls[1].env.Ali_Key, 'TEST_KEY'); assert.equal(calls[1].env.Ali_Secret, 'TEST_SECRET'); assert(!('CF_Token' in calls[1].env)); assert(calls[1].args.includes('dns_ali'));
  assert.equal((await readdir(tempRoot)).length, 0);
  console.log('PASS restored ACME account/workspace and Alibaba DNS credential isolation');
  fail = true;
  await assert.rejects(issuer(request), /SECRET SUBPROCESS OUTPUT/);
  assert.equal((await readdir(tempRoot)).length, 0);
  console.log('PASS failed issuance removes plaintext temporary files');
  await assert.rejects(issuer({ ...request, savedWorkspace: { files: { '../escape': 'AA==' } } }), /path/);
  assert.equal((await readdir(tempRoot)).length, 0);
  console.log('PASS saved workspace path traversal rejected');
} finally { await rm(tempRoot, { recursive: true, force: true }); }
