import path from 'node:path';
import tls from 'node:tls';
import { readFile, mkdir, lstat, readlink, symlink, rename, unlink, open } from 'node:fs/promises';
import { random, atomic } from '../server/security.mjs';
import { run } from '../server/process.mjs';
import { validateTrustedBundle } from '../shared/certificates.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function originOf(raw) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Invalid saved origin');
  return url.origin;
}
export async function verifyTLS(target, fingerprint) {
  if (!target || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535 || typeof target.host !== 'string' || typeof target.servername !== 'string') throw new Error('Local TLS probe required');
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const actual = await new Promise((resolve, reject) => {
        // A local deployment probe compares an authenticated expected fingerprint, not CA trust.
        const socket = tls.connect({ host: target.host, port: target.port, servername: target.servername, rejectUnauthorized: false, timeout: 2000 }, () => { const value = socket.getPeerCertificate().fingerprint256; socket.end(); resolve(value); });
        socket.on('error', reject); socket.on('timeout', () => socket.destroy(new Error('TLS probe timeout')));
      });
      if (actual === fingerprint) return;
    } catch {}
    if (attempt !== 9) await pause(500);
  }
  throw new Error('Service did not load the expected certificate');
}
async function switchLink(directory, version) {
  const current = path.join(directory, 'current');
  if (!version) { try { await unlink(current); } catch (e) { if (e.code !== 'ENOENT') throw e; } return; }
  const temp = path.join(directory, `.link-${random(8)}`);
  if (process.platform !== 'win32') {
    await symlink(`versions/${version}`, temp);
    try { await rename(temp, current); } finally { await unlink(temp).catch(() => {}); }
    return;
  }
  // Windows cannot replace directory symlinks using rename; Linux deployments use
  // the single atomic rename above. The journal protects this development fallback.
  const backup = path.join(directory, `.current-${random(8)}`);
  await symlink(`versions/${version}`, temp);
  let moved = false;
  try {
    await rename(current, backup).catch(e => { if (e.code !== 'ENOENT') throw e; });
    await rename(temp, current); moved = true;
    await unlink(backup).catch(() => {});
  } catch (error) {
    await unlink(temp).catch(() => {});
    if (!moved) await rename(backup, current).catch(() => {});
    throw error;
  }
}
async function previousVersion(directory) {
  try {
    const value = await readlink(path.join(directory, 'current'));
    const normalized = value.replaceAll('\\', '/');
    if (!/^versions\/[a-f0-9]{32}$/.test(normalized)) throw new Error('Unsafe current symlink');
    return normalized.slice(9);
  } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
function command(value) {
  if (!Array.isArray(value) || !value.length || !path.isAbsolute(value[0]) || value.some(v => typeof v !== 'string' || v.includes('\0'))) throw new Error('Commands must be local argv arrays starting with absolute executable paths');
  return value;
}
export async function syncAgent({ identity, config, fetchImpl = fetch, execute = run, probe = verifyTLS, validator = validateTrustedBundle, onFailure = () => {} }) {
  const origin = originOf(identity.server_url);
  const managed = config?.mode === 'managed';
  if (!/^[a-f0-9]{64}$/.test(identity.agent_token) || (!managed && !Array.isArray(config?.certificates))) throw new Error('Invalid agent configuration');
  const request = async (pathname, method = 'GET', input) => {
    const response = await fetchImpl(new URL(pathname, origin), { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${identity.agent_token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
    if (!response.ok) throw new Error(`Server request failed: HTTP ${response.status}`);
    if (response.status === 204) return;
    const length = Number(response.headers.get('content-length'));
    if (length > 1048576) throw new Error('Response too large');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 1048576) throw new Error('Response too large'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString());
  };
  const manifest = await request('/api/v1/agent/manifest');
  if (manifest.protocol_version !== 1 || !Array.isArray(manifest.certificates) || manifest.certificates.length > 100) throw new Error('Invalid manifest');
  const configured = new Map(); const directories = new Set();
  const validateTarget = target => {
    if (!/^cert-[a-f0-9]{16}$/.test(target.id) || configured.has(target.id) || !path.isAbsolute(target.directory) || directories.has(path.resolve(target.directory))) throw new Error('Invalid/duplicate certificate mapping');
    command(target.check); command(target.reload);
    const probeName = target.verify?.servername;
    if (typeof probeName !== 'string' || (probeName !== target.domain && !(probeName.endsWith(`.${target.domain}`) && !probeName.slice(0, -(target.domain.length + 1)).includes('.')))) throw new Error('TLS probe servername must be within the locally configured apex/wildcard');
    configured.set(target.id, target); directories.add(path.resolve(target.directory));
  };
  if (managed) {
    if (typeof config.directoryRoot !== 'string' || !path.isAbsolute(config.directoryRoot) || config.directoryRoot.includes('\0')) throw new Error('Invalid managed certificate directoryRoot');
    const root = path.resolve(config.directoryRoot);
    if (root === path.parse(root).root) throw new Error('Invalid managed certificate directoryRoot');
    const check = config.check; const reload = config.reload;
    command(check); command(reload);
    for (const item of manifest.certificates) {
      if (typeof item.domain !== 'string' || !/^[a-z0-9.-]+$/.test(item.domain) || item.domain.includes('..')) throw new Error('Invalid manifest domain');
      const verify = { host: '127.0.0.1', port: 443, ...(config.verify || {}), servername: config.verify?.servername || item.domain };
      validateTarget({ id: item.id, domain: item.domain, directory: path.join(root, item.domain), check, reload, verify });
    }
  } else {
    for (const target of config.certificates) validateTarget(target);
  }
  const results = [];
  for (const item of manifest.certificates) {
    const target = configured.get(item.id);
    if (!target) { results.push({ id: item.id, status: 'unconfigured' }); continue; }
    if (!/^[a-f0-9]{32}$/.test(item.version) || item.domain !== target.domain) throw new Error('Manifest violates local domain/version constraints');
    await mkdir(target.directory, { recursive: true, mode: 0o700 });
    if ((await lstat(target.directory)).isSymbolicLink()) throw new Error('Certificate directory must not be a symlink');
    const lockPath = path.join(target.directory, 'sync.lock');
    const lock = await open(lockPath, 'wx', 0o600).catch(() => { throw new Error('Agent directory locked; verify no sync is running before removing a stale lock'); });
    const journal = path.join(target.directory, 'pending.json');
    let old; let activated = false;
    const runLocal = async value => { const [file, ...args] = command(value); await execute(file, args, { timeout: 30000 }); };
    const rollback = async version => {
      await switchLink(target.directory, version);
      if (version) {
        const oldBundle = { domain: target.domain, fullchain: await readFile(path.join(target.directory, 'versions', version, 'fullchain.pem'), 'utf8'), privateKey: await readFile(path.join(target.directory, 'versions', version, 'privkey.pem'), 'utf8') };
        const metadata = await validator(oldBundle, { minimumValidityMs: 0 });
        await runLocal(target.check); await runLocal(target.reload); await probe(target.verify, metadata.fingerprint);
      }
    };
    try {
      // Recover an interrupted activation before reading/comparing the current version.
      try {
        const pending = JSON.parse(await readFile(journal, 'utf8'));
        if (pending.previous !== null && !/^[a-f0-9]{32}$/.test(pending.previous)) throw new Error('Invalid recovery journal');
        await rollback(pending.previous); await unlink(journal);
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
      old = await previousVersion(target.directory);
      if (item.staging) throw new Error('Refusing to install a staging certificate');
      const bundle = old === item.version
        ? { domain: target.domain, version: item.version, fullchain: await readFile(path.join(target.directory, 'current/fullchain.pem'), 'utf8'), privateKey: await readFile(path.join(target.directory, 'current/privkey.pem'), 'utf8') }
        : await request(`/api/v1/agent/certificates/${item.id}/${item.version}`);
      if (bundle.version !== item.version || bundle.domain !== target.domain) throw new Error('Bundle identity mismatch');
      const metadata = await validator(bundle);
      if (metadata.fingerprint !== item.fingerprint || metadata.fullchainHash !== item.fullchainHash || metadata.keyHash !== item.keyHash) throw new Error('Bundle manifest integrity mismatch');
      if (old === item.version) {
        await probe(target.verify, metadata.fingerprint);
      } else {
        const versions = path.join(target.directory, 'versions');
        await mkdir(versions, { recursive: true, mode: 0o700 });
        const destination = path.join(versions, item.version);
        try { await lstat(destination); } catch (e) {
          if (e.code !== 'ENOENT') throw e;
          const stage = path.join(versions, `.stage-${random(8)}`);
          await mkdir(stage, { mode: 0o700 });
          await atomic(path.join(stage, 'fullchain.pem'), bundle.fullchain); await atomic(path.join(stage, 'privkey.pem'), bundle.privateKey);
          await atomic(path.join(stage, 'metadata.json'), JSON.stringify(item));
          await rename(stage, destination);
        }
        // Existing immutable versions are validated too; a partial/modified release is never reused.
        if (await readFile(path.join(destination, 'fullchain.pem'), 'utf8') !== bundle.fullchain || await readFile(path.join(destination, 'privkey.pem'), 'utf8') !== bundle.privateKey) throw new Error('Existing version conflicts with immutable release');
        await atomic(journal, JSON.stringify({ previous: old, next: item.version }));
        await switchLink(target.directory, item.version); activated = true;
        await runLocal(target.check); await runLocal(target.reload); await probe(target.verify, metadata.fingerprint);
        await unlink(journal); activated = false;
      }
      await request('/api/v1/agent/receipts', 'POST', { certificateId: item.id, version: item.version, status: 'installed', fingerprint: metadata.fingerprint });
      results.push({ id: item.id, status: old === item.version ? 'verified' : 'installed' });
    } catch (error) {
      onFailure(error);
      let rollbackFailed = false;
      if (activated) {
        try { await rollback(old); await unlink(journal); } catch { rollbackFailed = true; }
      }
      try { await request('/api/v1/agent/receipts', 'POST', { certificateId: item.id, version: item.version, status: 'failed' }); } catch {}
      results.push({ id: item.id, status: rollbackFailed ? 'rollback_failed' : 'failed' });
    } finally { await lock.close(); await unlink(lockPath); }
  }
  await request('/api/v1/agent/heartbeat', 'POST', { agent_id: identity.agent_id, protocol_version: 1 });
  return results;
}
