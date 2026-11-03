import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from './process.mjs';
import { validateTrustedBundle } from '../shared/certificates.mjs';

async function archive(directory, prefix = '') {
  const files = {};
  for (const item of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, item.name);
    if (item.isDirectory()) Object.assign(files, await archive(directory, relative));
    else if (item.isFile()) files[relative] = (await readFile(path.join(directory, relative))).toString('base64');
    else throw new Error('Unsupported file in ACME workspace');
  }
  if (JSON.stringify(files).length > 4194304) throw new Error('ACME workspace exceeds limit');
  return files;
}
export function createIssuer({ acmePath = process.env.CERTRELAY_ACME_PATH, tempRoot = '/dev/shm', execute = run, platform = process.platform } = {}) {
  return async ({ certificate, credential, settings, savedWorkspace }) => {
    if (!acmePath || !path.isAbsolute(acmePath) || platform !== 'linux') throw new Error('ACME requires Linux and an absolute CERTRELAY_ACME_PATH');
    const workspace = await mkdtemp(path.join(tempRoot, 'certrelay-acme-'));
    try {
      if (savedWorkspace) for (const [relative, encoded] of Object.entries(savedWorkspace.files || {})) {
        if (relative.startsWith('/') || relative.split('/').includes('..') || relative.includes('\\')) throw new Error('Invalid saved ACME path');
        const target = path.join(workspace, relative);
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        let content = Buffer.from(encoded, 'base64');
        if (relative.endsWith('.conf')) {
          let conf = content.toString();
          if (typeof savedWorkspace.basePath === 'string') conf = conf.split(savedWorkspace.basePath).join(workspace);
          // Old plugin credentials/scopes must not override a newly selected or rotated credential.
          conf = conf.split('\n').filter(line => !/^\s*(?:SAVED_)?(?:CF_|Ali_)/.test(line)).join('\n');
          content = Buffer.from(conf);
        }
        await writeFile(target, content, { mode: 0o600 });
      }
      const home = path.join(workspace, 'config'); const certHome = path.join(workspace, 'certs');
      await mkdir(home, { recursive: true, mode: 0o700 }); await mkdir(certHome, { recursive: true, mode: 0o700 });
      const server = settings.staging ? 'https://acme-staging-v02.api.letsencrypt.org/directory' : 'https://acme-v02.api.letsencrypt.org/directory';
      const common = ['--home', workspace, '--config-home', home, '--cert-home', certHome, '--server', server];
      const env = { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOME: workspace, LANG: 'C.UTF-8', LE_CONFIG_HOME: home,
        ...(credential.provider === 'cf' ? { CF_Token: credential.secret.token, CF_Account_ID: credential.secret.accountId || '', CF_Zone_ID: credential.secret.zoneId || '' } : { Ali_Key: credential.secret.accessKeyId, Ali_Secret: credential.secret.accessKeySecret }) };
      await execute(acmePath, ['--register-account', ...common, '-m', settings.email], { env, timeout: 60000 });
      await execute(acmePath, ['--issue', ...common, '--dns', credential.provider === 'cf' ? 'dns_cf' : 'dns_ali', '-d', certificate.domain, '-d', `*.${certificate.domain}`, '--keylength', 'ec-256', '--dnssleep', '120', '--force'], { env, timeout: 900000 });
      // Export using acme.sh's documented installation interface, not its internal layout.
      const fullchainPath = path.join(workspace, 'fullchain.pem'); const keyPath = path.join(workspace, 'privkey.pem');
      await execute(acmePath, ['--install-cert', ...common, '-d', certificate.domain, '--ecc', '--fullchain-file', fullchainPath, '--key-file', keyPath], { env, timeout: 60000 });
      const bundle = { domain: certificate.domain, fullchain: await readFile(fullchainPath, 'utf8'), privateKey: await readFile(keyPath, 'utf8') };
      await validateTrustedBundle(bundle, { requireTrust: !settings.staging });
      return { bundle, workspace: { basePath: workspace, files: await archive(workspace) } };
    } finally { await rm(workspace, { recursive: true, force: true }); }
  };
}
