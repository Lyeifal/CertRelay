#!/usr/bin/env node
import { installAgent, installServer, help } from './install.mjs';
import { runAdminCommand, parseAdminArgs } from '../shared/admin-cli.mjs';
import { printPaths } from '../shared/paths-cli.mjs';

const [command, ...rest] = process.argv.slice(2);
const options = { _: [] };
for (let i = 0; i < rest.length; i++) {
  const item = rest[i];
  if (!item.startsWith('--')) { options._.push(item); continue; }
  const equal = item.indexOf('=');
  if (equal > 2) { options[item.slice(2, equal)] = item.slice(equal + 1); continue; }
  const key = item.slice(2);
  if (['dry-run', 'force'].includes(key)) options[key] = true;
  else options[key] = rest[++i];
}

try {
  if (command === 'init-admin' || command === 'reset-password') await runAdminCommand(command === 'init-admin' ? 'init' : 'reset', parseAdminArgs(rest));
  else if (command === 'paths') {
    if (rest.includes('--help')) console.log('用法：certrelay paths [--domain example.com] [--config /etc/certrelay-agent/config.json] [--data-dir PATH]。只显示路径，不显示文件内容。');
    else {
      if (options._.length || Object.keys(options).some(k => !['_', 'domain', 'config', 'data-dir'].includes(k))) throw new Error('paths 只支持 --domain、--config、--data-dir');
      for (const key of ['domain', 'config', 'data-dir']) if (Object.hasOwn(options, key) && (typeof options[key] !== 'string' || !options[key] || options[key].startsWith('--'))) throw new Error(`--${key} 需要填写值`);
      await printPaths(options);
    }
  }
  else if (command === 'install-server') await installServer(options);
  else if (command === 'install-agent') await installAgent(options);
  else help();
} catch (error) {
  console.error(`certrelay: ${error.message}`);
  process.exitCode = 1;
}
