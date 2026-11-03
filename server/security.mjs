import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rename, open } from 'node:fs/promises';
import path from 'node:path';

export const random = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export function equal(a, b) {
  const left = Buffer.from(String(a)); const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
export async function passwordHash(password, salt = random(16)) {
  return { salt, digest: (await promisify(crypto.scrypt)(password, salt, 64)).toString('hex') };
}
export async function atomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${random(8)}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, file);
  // Persist the directory entry as well on the Linux production target.
  if (process.platform === 'linux') {
    const parent = await open(path.dirname(file), 'r');
    try { await parent.sync(); } finally { await parent.close(); }
  }
}
export class Vault {
  constructor(key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Vault key must be exactly 32 bytes');
    this.key = key;
  }
  seal(value, purpose) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(purpose));
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  }
  unseal(value, purpose) {
    const cipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(value.iv, 'base64'));
    cipher.setAAD(Buffer.from(purpose)); cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]).toString());
  }
  code(value) { return crypto.createHmac('sha256', this.key).update(value).digest('hex'); }
}
export class Store {
  static async load(directory) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lock = await open(path.join(directory, 'server.lock'), 'wx', 0o600).catch(() => {
      throw new Error('Data directory locked. Never run two servers. If the previous process crashed, verify it stopped before removing server.lock.');
    });
    try {
      let key;
      try { key = await readFile(path.join(directory, 'master.key')); } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        try { await readFile(path.join(directory, 'state.json')); throw new Error('Master key missing: restore it from backup; refusing to create a replacement'); } catch (stateError) { if (stateError.code !== 'ENOENT') throw stateError; }
        key = crypto.randomBytes(32); await writeFile(path.join(directory, 'master.key'), key, { flag: 'wx', mode: 0o600 });
      }
      let state;
      try { state = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      return new Store(directory, key, state, lock);
    } catch (error) { await lock.close(); const { unlink } = await import('node:fs/promises'); await unlink(path.join(directory, 'server.lock')); throw error; }
  }
  constructor(directory, key, state, lock) {
    this.directory = directory; this.vault = new Vault(key); this.lock = lock;
    this.state = state || { schema: 1, admin: null, settings: { publicUrl: '', renewalDays: 30, checkMinutes: 60, staging: true, email: '' }, credentials: [], certificates: [], agents: [], invitations: [], events: [], jobs: [] };
    if (this.state.schema !== 1) throw new Error('Unsupported state schema');
    // Confirm the master key before accepting any requests.
    if (this.state.keyCheck) this.vault.unseal(this.state.keyCheck, 'key-check');
    this.state.keyCheck ||= this.vault.seal({ ok: true }, 'key-check');
    this.queue = Promise.resolve();
  }
  transaction(fn) {
    const task = this.queue.then(async () => {
      const next = structuredClone(this.state);
      const result = await fn(next);
      await atomic(path.join(this.directory, 'state.json'), JSON.stringify(next));
      this.state = next;
      return result;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async close() {
    await this.queue; await this.lock.close();
    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(this.directory, 'server.lock'));
  }
}
export function audit(state, action, subject, status = 'success') {
  state.events.unshift({ id: random(8), at: new Date().toISOString(), action, subject, status });
  state.events = state.events.slice(0, 1000);
}
