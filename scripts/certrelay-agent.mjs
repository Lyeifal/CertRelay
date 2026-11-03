#!/usr/bin/env node
import { readFile, writeFile, mkdir, chmod, link, unlink, access, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { syncAgent } from '../agent/sync.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'help';
const arg = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const systemIdentity = process.getuid?.() === 0 && existsSync('/etc/certrelay-agent') ? '/etc/certrelay-agent/identity.json' : null;
const identityPath = arg('--identity') || process.env.CERTRELAY_IDENTITY || systemIdentity || path.join(os.homedir(), '.config', 'certrelay-agent', 'identity.json');
const timeoutMs = 15000;
const fail = (message) => { console.error(`certrelay-agent: ${message}`); process.exitCode = 1; };

function normalizeLink(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { throw new Error('登记链接无效。'); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new Error('登记链接必须使用 HTTPS；HTTP 仅允许本机开发地址。');
  if (url.username || url.password || url.search || url.hash || !/^\/enroll\/[A-Za-z0-9_-]+$/.test(url.pathname)) throw new Error('登记链接包含不支持的账号、参数或路径。');
  return url;
}

async function prompt(message, hidden = false) {
  if (!hidden || !process.stdin.isTTY) {
    const input = readline.createInterface({ input: process.stdin, output: process.stderr });
    try { return (await new Promise((resolve) => input.question(message, resolve))).trim(); } finally { input.close(); }
  }
  process.stderr.write(message);
  const stdin = process.stdin;
  stdin.setRawMode(true); stdin.resume();
  let value = '';
  try {
    for await (const chunk of stdin) {
      for (const char of String(chunk)) {
        if (char === '\u0003') throw new Error('已取消。');
        if (char === '\r' || char === '\n') { process.stderr.write('\n'); return value.trim(); }
        if (char === '\u007f') { value = value.slice(0, -1); continue; }
        if (/[0-9]/.test(char)) value += char;
      }
    }
  } finally { stdin.setRawMode(false); stdin.pause(); }
  return value.trim();
}

async function claim(link, code) {
  const invitationId = link.pathname.split('/').at(-1);
  const endpoint = new URL(`/api/v1/enrollments/${invitationId}/claim`, link.origin);
  const response = await fetch(endpoint, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.replace(/\s+/g, ''), name: arg('--name') || os.hostname(), arch: process.arch, os: `${process.platform} ${os.release()}`, agent_version: '0.1.0', protocol_version: 1 }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `服务端返回 HTTP ${response.status}`);
  return body;
}

async function saveIdentity(identity) {
  await mkdir(path.dirname(identityPath), { recursive: true, mode: 0o700 });
  const temporary = `${identityPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await chmod(temporary, 0o600);
  try { await link(temporary, identityPath); } finally { await unlink(temporary); }
}

async function readIdentity() {
  let identity;
  try { identity = JSON.parse(await readFile(identityPath, 'utf8')); } catch { throw new Error(`找不到身份文件：${identityPath}`); }
  if (process.platform !== 'win32' && ((await stat(identityPath)).mode & 0o077)) throw new Error('身份文件权限必须为 0600。');
  if (!identity.server_url || !identity.agent_id || !identity.agent_token) throw new Error('身份文件缺少必要字段。');
  return identity;
}

async function enroll() {
  try {
    await access(identityPath);
    throw new Error('身份文件已存在，拒绝覆盖。重新登记前请先撤销旧身份。');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(path.dirname(identityPath), { recursive: true, mode: 0o700 });
  const probePath = `${identityPath}.${process.pid}.probe`;
  await writeFile(probePath, '', { flag: 'wx', mode: 0o600 }); await unlink(probePath);
  const link = normalizeLink(arg('--link') || await prompt('登记链接: '));
  console.log(`连接中心：${link.origin}`);
  let suppliedCode;
  if (args.includes('--code-stdin')) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    suppliedCode = Buffer.concat(chunks).toString('utf8').trim();
  }
  const code = suppliedCode ?? arg('--code') ?? await prompt('验证码（输入不可见）: ', true);
  if (!/^\d{8}$/.test(code.replace(/\s+/g, ''))) throw new Error('验证码应为 8 位数字。');
  const result = await claim(link, code);
  if (result.server_url && result.server_url !== link.origin) throw new Error('拒绝服务端返回的跨源地址。');
  if (!/^agent-[a-f0-9]{16}$/.test(result.agent_id) || !/^[a-f0-9]{64}$/.test(result.agent_token) || result.protocol_version !== 1) throw new Error('登记响应格式或协议版本无效。');
  await saveIdentity({ schema_version: 1, server_url: link.origin, agent_id: result.agent_id, agent_token: result.agent_token, protocol_version: result.protocol_version, enrolled_at: new Date().toISOString() });
  console.log(`登记成功：${result.agent_id}`);
  console.log(`身份已保存：${identityPath}`);
}

async function heartbeat() {
  const identity = await readIdentity();
  normalizeLink(`${identity.server_url}/enroll/identity-check`);
  const response = await fetch(new URL('/api/v1/agent/heartbeat', identity.server_url), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { Authorization: `Bearer ${identity.agent_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: identity.agent_id, protocol_version: identity.protocol_version }) });
  if (response.status !== 204) { const body = await response.json().catch(() => ({})); throw new Error(body?.error?.message || `服务端返回 HTTP ${response.status}`); }
  console.log(`心跳成功：${identity.agent_id}`);
}

function help() {
  console.log('用法：\n  certrelay-agent enroll [--link URL] [--name NAME] [--identity PATH]\n  certrelay-agent heartbeat [--identity PATH]\n  certrelay-agent sync --config PATH [--identity PATH]\n\n省略 --code 时会在终端隐藏读取验证码；自动化可通过 --code-stdin 从标准输入读取。');
}

try {
  if (command === 'enroll') await enroll();
  else if (command === 'heartbeat') await heartbeat();
  else if (command === 'sync') {
    if (!arg('--config')) throw new Error('需要 --config 指向本地安装配置。');
    const config = JSON.parse(await readFile(arg('--config'), 'utf8'));
    await heartbeat();
    const results = await syncAgent({ identity: await readIdentity(), config });
    console.log(JSON.stringify({ results }));
    if (results.some(r => ['failed', 'rollback_failed'].includes(r.status))) process.exitCode = 1;
  }
  else help();
} catch (error) { fail(error.name === 'AbortError' ? '请求超时。' : error.message); }
