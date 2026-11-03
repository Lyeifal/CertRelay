import path from 'node:path';
import { domainToASCII } from 'node:url';
import { readFile } from 'node:fs/promises';
import { resolveDataDirectory } from './admin-cli.mjs';

export async function describePaths(options = {}) {
  const configPath = path.resolve(options.config || '/etc/certrelay-agent/config.json');
  let config = null;
  try { config = JSON.parse(await readFile(configPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let domain = options.domain;
  if (domain) {
    domain = domainToASCII(domain.replace(/^\*\./, '').trim().toLowerCase());
    if (!domain || !/^[a-z0-9.-]+$/.test(domain) || domain.includes('..') || !domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) throw new Error('请填写根域名，例如 example.com；不要填 URL 或文件路径。');
  }
  const targets = [];
  if (config?.mode === 'managed') {
    if (typeof config.directoryRoot !== 'string' || !path.isAbsolute(config.directoryRoot)) throw new Error('客户端 directoryRoot 必须为绝对路径');
    targets.push({ domain: domain || '<根域名>', directory: path.join(config.directoryRoot, domain || '<根域名>'), example: !domain });
  } else if (Array.isArray(config?.certificates)) {
    for (const c of config.certificates) if (!domain || c.domain === domain) {
      if (typeof c.directory !== 'string' || !path.isAbsolute(c.directory)) throw new Error('证书映射目录无效');
      targets.push({ domain: c.domain, directory: c.directory, example: false });
    }
  } else if (!config) targets.push({ domain: domain || 'example.com', directory: path.join('/etc/certrelay-certs', domain || 'example.com'), example: true });
  return {
    dataDirectory: await resolveDataDirectory(options), configPath, configured: Boolean(config),
    targets: targets.map(t => ({ ...t, certificate: path.join(t.directory, 'current', 'fullchain.pem'), privateKey: path.join(t.directory, 'current', 'privkey.pem') })),
  };
}

export async function printPaths(options = {}) {
  const result = await describePaths(options);
  console.log(`服务端数据目录：${result.dataDirectory}（仅路径，不读取密钥）`);
  console.log('服务端证书加密存于 state.json 中，不是供 Nginx 直接使用的 PEM 文件。');
  console.log(`客户端配置：${result.configPath}${result.configured ? '' : '（未找到，下面仅为默认路径示例）'}`);
  for (const t of result.targets) {
    console.log(`\n域名：${t.domain}${t.example ? '（示例）' : ''}`);
    console.log(`证书路径：${t.certificate}`);
    console.log(`私钥路径：${t.privateKey}`);
  }
  if (!result.targets.length) console.log('当前配置中没有匹配的证书映射。');
  console.log('\n路径不代表文件已存在。只有生产签发成功、客户端已获授权并同步成功，才会安装证书。');
}
