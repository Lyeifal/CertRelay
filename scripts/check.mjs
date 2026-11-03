import { readdir, readFile } from 'node:fs/promises';
import vm from 'node:vm';
// Parse every module without executing it or spawning sandbox-blocked processes.
const directories = ['server', 'shared', 'agent', 'src', 'scripts', 'test'];
let count = 0;
for (const directory of directories) for (const item of await readdir(directory)) {
  if (!/\.(mjs|js)$/.test(item)) continue;
  const file = `${directory}/${item}`;
  const source = await readFile(file, 'utf8');
  if (file.startsWith('src/')) new vm.Script(source, { filename: file });
  else new vm.SourceTextModule(source, { identifier: file });
  count++;
}
console.log(`${count} source files parsed successfully; none executed.`);
