import { spawn } from 'node:child_process';
// No shell interpolation, bounded output, process-group cancellation on Linux.
export function run(file, args, { env = process.env, timeout = 900000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, cwd, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let size = 0; let failed = false;
    const stop = () => {
      failed = true;
      try { if (process.platform === 'win32') child.kill(); else process.kill(-child.pid, 'SIGKILL'); } catch {}
    };
    const timer = setTimeout(stop, timeout);
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 2097152) stop(); });
    child.stderr.on('data', chunk => { size += chunk.length; if (size > 2097152) stop(); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Executable unavailable or process start failed')); });
    child.on('close', code => { clearTimeout(timer); if (failed || code !== 0) reject(new Error('Command failed (output withheld to protect secrets)')); else resolve(); });
  });
}
