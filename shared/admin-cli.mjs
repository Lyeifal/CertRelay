import path from 'node:path';
import { readFile, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { Store, passwordHash, audit } from '../server/security.mjs';
import { prompt } from './prompt.mjs';

// Read only a literal data path. Never execute/source a shell environment file.
export function dataDirectoryFromEnv(source) {
  const line = source.split(/\r?\n/).find(line => /^\s*CERTRELAY_DATA_DIR\s*=/.test(line));
  if (!line) return null;
  let value = line.slice(line.indexOf('=') + 1).trim();
  if (value.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\[\\"])*"$/.test(value)) throw new Error('server.env 中的数据目录格式无效，请显式指定 --data-dir');
    value = value.slice(1, -1).replace(/\\([\\"])/g, '$1');
  } else if (value.startsWith("'")) {
    if (!/^'[^']*'$/.test(value)) throw new Error('server.env 中的数据目录格式无效，请显式指定 --data-dir');
    value = value.slice(1, -1);
  } else if (/\s|["'\\]/.test(value)) throw new Error('server.env 中的数据目录格式无效，请显式指定 --data-dir');
  if (!value || !path.isAbsolute(value) || /[\r\n\0]/.test(value)) throw new Error('server.env 中必须填写绝对数据目录');
  return value;
}

export async function resolveDataDirectory(options = {}, { env = process.env, envFile = '/etc/certrelay/server.env', cwd = process.cwd() } = {}) {
  let value = options['data-dir'] || env.CERTRELAY_DATA_DIR;
  if (!value) {
    try { value = dataDirectoryFromEnv(await readFile(envFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return path.resolve(cwd, value || 'data');
}

export function parseAdminArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') { options.help = true; continue; }
    if (args[i].startsWith('--data-dir=')) { options['data-dir'] = args[i].slice(11); continue; }
    if (args[i] !== '--data-dir' || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('用法：--data-dir /实际数据目录（密码请在隐藏提示中输入，不要放到命令行）');
    options['data-dir'] = args[++i];
  }
  if (Object.hasOwn(options, 'data-dir') && !options['data-dir']) throw new Error('--data-dir 不能为空');
  return options;
}

export async function changeStoredPassword(mode, directory, password) {
  if (!['init', 'reset'].includes(mode)) throw new Error('Unknown administrator operation');
  if (typeof password !== 'string' || password.length < 14 || password.length > 1024) throw new Error('密码须为 14–1024 个字符，可以自设长口令，不要求随机字符或特殊符号。');
  if (mode === 'reset') {
    // Never create a new vault or replacement master key during password recovery.
    try {
      await access(path.join(directory, 'state.json'), constants.R_OK);
      await access(path.join(directory, 'master.key'), constants.R_OK);
    } catch { throw new Error('没有找到可读的 state.json 和 master.key；请确认 --data-dir，重置密码不会创建或替换它们。'); }
  }
  const store = await Store.load(directory);
  try {
    if (mode === 'init' && store.state.admin) throw new Error('管理员已设置，请登录后在“设置”修改，或停服后使用 certrelay reset-password。');
    if (mode === 'reset' && !store.state.admin) throw new Error('尚未设置管理员，请先使用 certrelay init-admin。');
    const digest = await passwordHash(password);
    await store.transaction(s => {
      s.admin = digest;
      if (mode === 'reset') audit(s, 'admin_password_reset', 'offline administrator recovery');
    });
  } finally { await store.close(); }
}

export async function runAdminCommand(mode, options = {}) {
  if (options.help) {
    console.log(`用法：certrelay ${mode === 'init' ? 'init-admin' : 'reset-password'} [--data-dir /实际数据目录]\n密码由你自己设置，至少 14 个字符；不接受命令行明文密码。重置前请先停止服务。`);
    return;
  }
  const directory = await resolveDataDirectory(options);
  console.log(`数据目录：${directory}`);
  // Root invocation must not replace service-owned state with root-owned files.
  if (process.platform === 'linux' && process.getuid?.() === 0) {
    try {
      const owner = await stat(directory);
      if (owner.uid !== 0) { process.setgroups([]); process.setgid(owner.gid); process.setuid(owner.uid); }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  try {
    await access(path.join(directory, 'server.lock'));
    throw new Error('数据目录仍被锁定。先执行 systemctl stop certrelay，再重置；不要在服务运行时删除 server.lock。若停服后仍有锁，请先排查是否有其他实例。');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (mode === 'reset') {
    try { await access(path.join(directory, 'state.json')); await access(path.join(directory, 'master.key')); }
    catch { throw new Error('找不到 state.json/master.key，请检查数据目录；本次没有创建新数据。'); }
  }
  const password = await prompt('设置你自己的管理员密码（至少 14 个字符，输入不显示）：', true);
  if (process.stdin.isTTY) {
    const confirmation = await prompt('再输入一次密码：', true);
    if (password !== confirmation) throw new Error('两次密码不一致，没有修改。');
  }
  await changeStoredPassword(mode, directory, password);
  console.log(mode === 'init' ? '管理员密码已设置，请用刚才输入的密码登录面板。' : '管理员密码已重置，请启动服务并使用新密码登录。证书、DNS 凭据和客户端身份不变。');
  console.log('妥善备份此数据目录中的 master.key 与 state.json；不需要记住或手动输入 master.key。');
}
