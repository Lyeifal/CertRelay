#!/usr/bin/env node
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, cp, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const nodePath = process.execPath;
const isLinux = process.platform === 'linux';
const isRoot = process.getuid?.() === 0;

const paths = {
  serverRoot: '/opt/certrelay',
  serverApp: '/opt/certrelay/current',
  serverEnv: '/etc/certrelay/server.env',
  serverUnit: '/etc/systemd/system/certrelay.service',
  serverData: '/var/lib/certrelay',
  agentRoot: '/opt/certrelay-agent',
  agentApp: '/opt/certrelay-agent/current',
  agentConfigDir: '/etc/certrelay-agent',
  agentConfig: '/etc/certrelay-agent/config.json',
  agentIdentity: '/etc/certrelay-agent/identity.json',
  agentUnit: '/etc/systemd/system/certrelay-agent.service',
  agentTimer: '/etc/systemd/system/certrelay-agent.timer',
};

function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) { options._.push(item); continue; }
    const equal = item.indexOf('=');
    if (equal > 2) { options[item.slice(2, equal)] = item.slice(equal + 1); continue; }
    const key = item.slice(2);
    if (['dry-run', 'force'].includes(key)) options[key] = true;
    else options[key] = argv[++i];
  }
  return options;
}

function quoteEnv(value) {
  const text = String(value ?? '');
  if (!text || /[\r\n]/.test(text)) throw new Error('Environment values must be non-empty and single-line');
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function requireTarget(options) {
  if (options['dry-run']) return;
  if (!isLinux) throw new Error('The production installer currently supports Linux only. Use --dry-run on another OS.');
  if (!isRoot) throw new Error('The production installer must run as root (or via sudo).');
}

async function command(file, args, options = {}) {
  try {
    const result = await execFile(file, args, { encoding: 'utf8', input: options.input });
    return result.stdout?.trim() || '';
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message || '').trim();
    throw new Error(`${file} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
}

async function writeIfMissing(file, content, mode = 0o600, force = false) {
  if (!force && existsSync(file)) return false;
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, content, { mode });
  await chmod(file, mode);
  return true;
}

async function installTree(destination, force) {
  const source = await realpath(packageRoot);
  if (path.resolve(source) === path.resolve(destination)) return false;
  if (!force && existsSync(path.join(destination, 'package.json'))) return false;
  await mkdir(destination, { recursive: true, mode: 0o755 });
  await cp(source, destination, {
    recursive: true,
    force: true,
    filter: (item) => !/(^|[\\/])(?:node_modules|\.git|tmp)(?:[\\/]|$)/.test(item) && !/\.(?:tgz|tar\.gz)$/.test(item),
  });
  return true;
}

async function ensureUser(name, home) {
  try { await command('getent', ['passwd', name]); return; } catch {}
  await command('useradd', ['--system', '--user-group', '--no-create-home', '--home-dir', home, '--shell', '/usr/sbin/nologin', name]);
}

async function systemd(action, ...units) {
  await command('systemctl', [action, ...units]);
}

function serverUnit(dataDir) {
  return `[Unit]\nDescription=CertRelay personal certificate control plane\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nUser=certrelay\nGroup=certrelay\nWorkingDirectory=${paths.serverApp}\nEnvironmentFile=${paths.serverEnv}\nExecStart=${nodePath} ${paths.serverApp}/scripts/server.mjs\nUMask=0077\nRestart=on-failure\nRestartSec=10\nTimeoutStopSec=20min\nKillMode=control-group\nNoNewPrivileges=true\nProtectSystem=strict\nProtectHome=true\nPrivateTmp=true\nPrivateDevices=true\nProtectKernelTunables=true\nProtectKernelModules=true\nProtectControlGroups=true\nRestrictSUIDSGID=true\nCapabilityBoundingSet=\nReadWritePaths=${dataDir}\nMemoryMax=384M\nTasksMax=96\n\n[Install]\nWantedBy=multi-user.target\n`;
}

function agentUnit() {
  return `[Unit]\nDescription=CertRelay certificate pull, install and verification\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=oneshot\nUser=root\nGroup=root\nExecStart=${nodePath} ${paths.agentApp}/scripts/certrelay-agent.mjs sync --identity ${paths.agentIdentity} --config ${paths.agentConfig}\nUMask=0077\nPrivateTmp=true\nProtectHome=true\nTimeoutStartSec=4min\nMemoryMax=128M\nTasksMax=48\n`;
}

function agentTimer() {
  return `[Unit]\nDescription=Poll CertRelay for authorized certificate updates\n\n[Timer]\nOnBootSec=2min\nOnUnitInactiveSec=30min\nRandomizedDelaySec=3min\nUnit=certrelay-agent.service\n\n[Install]\nWantedBy=timers.target\n`;
}

function printDryRun(kind, options, files) {
  console.log(`[dry-run] certrelay install-${kind}`);
  console.log(`[dry-run] Node: ${nodePath}`);
  for (const file of files) console.log(`[dry-run] would write ${file}`);
  if (kind === 'server') console.log(`[dry-run] public URL: ${options['public-url'] || process.env.CERTRELAY_PUBLIC_URL || '<required>'}`);
  if (kind === 'agent') console.log(`[dry-run] enrollment: ${options.link ? 'requested' : 'not requested'}`);
}

export async function installServer(raw = {}) {
  const options = { ...raw };
  requireTarget(options);
  const publicUrl = options['public-url'] || process.env.CERTRELAY_PUBLIC_URL;
  if (!publicUrl) throw new Error('Missing --public-url, for example https://ssl.example.com');
  const dataDir = options['data-dir'] || paths.serverData;
  const port = options.port || '4173';
  const acmePath = options['acme-path'] || '/opt/acme.sh/acme.sh';
  let publicOrigin;
  try { publicOrigin = new URL(publicUrl); } catch { throw new Error('--public-url must be a valid URL'); }
  if (publicOrigin.protocol !== 'https:' || publicOrigin.pathname !== '/' || publicOrigin.search || publicOrigin.hash) throw new Error('--public-url must be an HTTPS origin without a path or query');
  if (!path.isAbsolute(dataDir) || path.resolve(dataDir) === path.parse(path.resolve(dataDir)).root) throw new Error('--data-dir must be an absolute non-root directory');
  if (!path.isAbsolute(acmePath)) throw new Error('--acme-path must be an absolute path');
  if (!/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('--port must be between 1 and 65535');
  const env = `CERTRELAY_DATA_DIR="${quoteEnv(dataDir)}"\nCERTRELAY_PUBLIC_URL="${quoteEnv(publicUrl)}"\nCERTRELAY_HOST="127.0.0.1"\nCERTRELAY_PORT="${quoteEnv(port)}"\nCERTRELAY_ACME_PATH="${quoteEnv(acmePath)}"\n`;
  if (options['dry-run']) { printDryRun('server', options, [paths.serverApp, paths.serverEnv, paths.serverUnit]); return; }
  await ensureUser('certrelay', dataDir);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await command('chown', ['-R', 'certrelay:certrelay', dataDir]);
  await installTree(paths.serverApp, Boolean(options.force));
  await writeIfMissing(paths.serverEnv, env, 0o600, Boolean(options.force));
  await writeIfMissing(paths.serverUnit, serverUnit(dataDir), 0o644, Boolean(options.force));
  await systemd('daemon-reload');
  await systemd('enable', 'certrelay.service');
  await systemd('restart', 'certrelay.service');
  console.log(`CertRelay server installed at ${paths.serverApp}`);
  console.log(`Environment: ${paths.serverEnv}`);
  console.log(`Data: ${dataDir}`);
  console.log('请先停止服务后设置你自己的面板密码，再启动（至少 14 个字符，不要求随机符号）：');
  console.log(`systemctl stop certrelay\ncertrelay init-admin --data-dir ${dataDir}\nsystemctl start certrelay`);
  console.log('证书路径可在客户端执行 certrelay paths --domain example.com 查看；密码不是证书私钥或客户端令牌。');
}

async function enrollAgent(options) {
  if (!options.link) return false;
  if (!options.code && !process.stdin.isTTY) throw new Error('Non-interactive enrollment requires --code; interactive enrollment hides the code at the terminal');
  const args = [paths.agentApp + '/scripts/certrelay-agent.mjs', 'enroll', '--link', options.link, '--identity', paths.agentIdentity];
  if (options.code) args.push('--code-stdin');
  await new Promise((resolve, reject) => {
    const child = spawn(nodePath, args, { stdio: [options.code ? 'pipe' : 'inherit', 'inherit', 'inherit'] });
    if (options.code) child.stdin.end(`${String(options.code).replace(/\s+/g, '')}\n`);
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Enrollment exited with code ${code}`)));
  });
  return true;
}

export async function installAgent(raw = {}) {
  const options = { ...raw };
  requireTarget(options);
  const directoryRoot = options['directory-root'] || '/etc/certrelay-certs';
  if (!path.isAbsolute(directoryRoot) || path.resolve(directoryRoot) === path.parse(path.resolve(directoryRoot)).root) throw new Error('--directory-root must be an absolute non-root directory');
  if (options['verify-port'] && (!/^\d+$/.test(String(options['verify-port'])) || Number(options['verify-port']) < 1 || Number(options['verify-port']) > 65535)) throw new Error('--verify-port must be between 1 and 65535');
  const config = {
    mode: 'managed',
    directoryRoot,
    check: ['/usr/sbin/nginx', '-t'],
    reload: ['/usr/bin/systemctl', 'reload', 'nginx'],
    verify: { host: '127.0.0.1', port: Number(options['verify-port'] || 443), ...(options.servername ? { servername: options.servername } : {}) },
  };
  if (options['dry-run']) { printDryRun('agent', options, [paths.agentApp, paths.agentConfig, paths.agentUnit, paths.agentTimer]); return; }
  await mkdir(paths.agentConfigDir, { recursive: true, mode: 0o700 });
  await mkdir(directoryRoot, { recursive: true, mode: 0o700 });
  await installTree(paths.agentApp, Boolean(options.force));
  await writeIfMissing(paths.agentConfig, `${JSON.stringify(config, null, 2)}\n`, 0o600, Boolean(options.force));
  await writeFile(paths.agentUnit, agentUnit(), { mode: 0o644 });
  await writeFile(paths.agentTimer, agentTimer(), { mode: 0o644 });
  await chmod(paths.agentConfig, 0o600);
  await systemd('daemon-reload');
  const enrolled = await enrollAgent(options);
  if (enrolled) {
    await chmod(paths.agentIdentity, 0o600);
    await systemd('enable', '--now', 'certrelay-agent.timer');
    console.log(`CertRelay agent installed and enrolled. Identity: ${paths.agentIdentity}`);
  } else {
    console.log(`CertRelay agent installed. Config: ${paths.agentConfig}`);
    console.log(`Enroll with: ${nodePath} ${paths.agentApp}/scripts/certrelay-agent.mjs enroll --identity ${paths.agentIdentity}`);
    console.log('The timer was not enabled until enrollment succeeds.');
  }
}

export function help() {
  console.log('日常使用（0.3.1 新增，本地代码尚未发布）：\n  certrelay init-admin [--data-dir PATH]     设置自己的面板密码\n  certrelay reset-password [--data-dir PATH] 忘记密码后重置，先停止服务\n  certrelay paths [--domain example.com] [--config PATH] 查看本机证书路径\n');
  console.log(`CertRelay installer\n\n  certrelay install-server --public-url https://certs.example.com [options]\n  certrelay install-agent [--link URL] [--code CODE] [options]\n\nOptions:\n  --dry-run                 Print planned files without changing the system\n  --force                   Replace generated env/config and application files\n  --public-url URL          Server public HTTPS origin\n  --data-dir PATH           Server state directory (default /var/lib/certrelay)\n  --acme-path PATH          acme.sh executable (default /opt/acme.sh/acme.sh)\n  --directory-root PATH     Agent certificate root (default /etc/certrelay-certs)\n  --servername NAME         Local TLS probe name for the agent\n  --verify-port PORT        Local TLS probe port (default 443)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const options = parseArgs(process.argv.slice(2));
  const commandName = options._[0];
  try {
    if (commandName === 'server') await installServer(options);
    else if (commandName === 'agent') await installAgent(options);
    else help();
  } catch (error) {
    console.error(`certrelay installer: ${error.message}`);
    process.exitCode = 1;
  }
}
