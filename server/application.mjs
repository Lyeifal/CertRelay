import http from 'node:http';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, domainToASCII } from 'node:url';
import { readFile } from 'node:fs/promises';
import { Store, random, hash, equal, passwordHash, audit } from './security.mjs';
import { createIssuer } from './acme.mjs';
import { validateTrustedBundle } from '../shared/certificates.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/src/app.js', ['src/live-app.js', 'text/javascript']], ['/src/styles.css', ['src/styles.css', 'text/css']], ['/src/live.css', ['src/live.css', 'text/css']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]]);
const text = (v, max = 120) => String(v || '').trim().slice(0, max);
class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const reject = (status, code) => { throw new ApiError(status, code); };
const assert = (condition, code = 'invalid_input') => { if (!condition) reject(422, code); };
const validName = v => /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,47}$/.test(v);
const certId = v => /^cert-[a-f0-9]{16}$/.test(v);
const codeView = i => ({ invitation_id: i.id, agent_id: i.agentId, name: i.name, label: i.label, arch: i.arch, expires_at: new Date(i.expiresAt).toISOString(), status: i.status === 'pending' && i.expiresAt <= Date.now() ? 'expired' : i.status, attempts: i.attempts, certificateIds: i.certificateIds });
const safeCredential = ({ secret, ...c }) => c;
const safeCertificate = ({ bundle, workspace, ...c }) => c;

export async function createApplication({ directory, publicUrl, host = '127.0.0.1', port = 4173, allowLocalHttp = false, issuer = createIssuer(), validator = validateTrustedBundle, clock = Date.now, schedule = true } = {}) {
  const url = new URL(publicUrl);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(allowLocalHttp && local && host === '127.0.0.1' && url.protocol === 'http:'))) throw new Error('Public URL must be an HTTPS origin (HTTP requires explicit loopback development mode)');
  const origin = url.origin;
  const secure = url.protocol === 'https:';
  const cookieName = secure ? '__Host-certrelay' : 'certrelay-local';
  const store = await Store.load(directory);
  if (!store.state.admin) { await store.close(); throw new Error('Initialize the administrator first: npm run init'); }
  if (store.state.settings.publicUrl && store.state.settings.publicUrl !== origin) { await store.close(); throw new Error('Public origin differs from saved state: migrate explicitly, do not silently redirect existing clients'); }
  await store.transaction(s => {
    s.settings.publicUrl = origin;
    for (const job of s.jobs) if (job.status === 'running' || job.status === 'queued') { job.status = 'interrupted'; job.finishedAt = new Date(clock()).toISOString(); }
  });
  const sessions = new Map(); const limits = new Map(); const workers = new Set();
  let jobQueue = Promise.resolve(); let closing = false; let enqueueing = false;
  function limit(key, maximum, window) {
    const now = clock();
    if (limits.size >= 4096) for (const [k, value] of limits) if (value.until <= now) limits.delete(k);
    if (!limits.has(key) && limits.size >= 4096) reject(429, 'rate_limited');
    let bucket = limits.get(key);
    if (!bucket || bucket.until <= now) { bucket = { count: 0, until: now + window }; limits.set(key, bucket); }
    if (++bucket.count > maximum) reject(429, 'rate_limited');
  }
  function send(res, status, body, extra = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  }
  async function body(req) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) reject(415, 'json_required');
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 65536) reject(413, 'body_too_large'); chunks.push(chunk); }
    let result;
    try { result = JSON.parse(Buffer.concat(chunks).toString()); } catch { reject(400, 'invalid_json'); }
    if (!result || Array.isArray(result) || typeof result !== 'object') reject(400, 'invalid_json');
    return result;
  }
  function session(req, mutation = false) {
    const cookie = String(req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const key = hash(cookie || ''); const entry = sessions.get(key);
    if (!entry || entry.until <= clock()) { sessions.delete(key); reject(401, 'admin_login_required'); }
    if (mutation && !equal(req.headers['x-csrf-token'] || '', entry.csrf)) reject(403, 'csrf_required');
    return { ...entry, key };
  }
  function agent(req, state = store.state) {
    const authorization = String(req.headers.authorization || '');
    if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) reject(401, 'agent_unauthorized');
    const digest = hash(authorization.slice(7));
    const found = state.agents.find(a => !a.revokedAt && equal(a.tokenHash, digest));
    if (!found) reject(401, 'agent_unauthorized');
    return found;
  }
  function ids(input, state) {
    assert(Array.isArray(input) && input.length <= 100 && input.every(id => certId(id) && state.certificates.some(c => c.id === id)), 'invalid_certificate_permissions');
    return [...new Set(input)];
  }
  function credentialSecret(provider, input) {
    assert(input && typeof input === 'object', 'credentials_required');
    if (provider === 'cf') {
      assert(typeof input.token === 'string' && /^[\w-]{20,256}$/.test(input.token), 'invalid_cf_token');
      for (const field of ['accountId', 'zoneId']) assert(!input[field] || /^[a-f0-9]{32}$/.test(input[field]), 'invalid_cf_scope');
      return { token: input.token, accountId: input.accountId || '', zoneId: input.zoneId || '' };
    }
    assert(typeof input.accessKeyId === 'string' && /^[\w-]{8,128}$/.test(input.accessKeyId), 'invalid_ali_key');
    assert(typeof input.accessKeySecret === 'string' && /^[\w+/=-]{16,256}$/.test(input.accessKeySecret), 'invalid_ali_secret');
    return { accessKeyId: input.accessKeyId, accessKeySecret: input.accessKeySecret };
  }
  function publicState() {
    const s = store.state;
    return { settings: s.settings, credentials: s.credentials.map(safeCredential), certificates: s.certificates.map(safeCertificate), invitations: s.invitations.map(codeView), events: s.events, jobs: s.jobs,
      agents: s.agents.map(({ tokenHash, ...a }) => ({ ...a, status: a.revokedAt ? 'revoked' : clock() - Date.parse(a.lastSeen) < 900000 ? 'online' : 'offline' })) };
  }
  async function issueJob(id) {
    const job = store.state.jobs.find(j => j.id === id);
    if (!job || closing) return;
    await store.transaction(s => { const j = s.jobs.find(j => j.id === id); j.status = 'running'; j.startedAt = new Date(clock()).toISOString(); });
    try {
      const certificate = structuredClone(store.state.certificates.find(c => c.id === job.certificateId));
      const credential = store.state.credentials.find(c => c.id === certificate.credentialId);
      if (!credential) throw new Error('Missing credential');
      const secret = store.vault.unseal(credential.secret, `credential:${credential.id}`);
      const settings = structuredClone(store.state.settings);
      if (!settings.email) throw new Error('ACME email not configured');
      const result = await issuer({ certificate, credential: { provider: credential.provider, secret }, settings,
        savedWorkspace: certificate.workspace ? store.vault.unseal(certificate.workspace, `workspace:${certificate.id}`) : undefined });
      const metadata = await validator(result.bundle, { requireTrust: !settings.staging });
      const version = random(16);
      await store.transaction(s => {
        const c = s.certificates.find(c => c.id === certificate.id);
        // A staging run must not replace an already usable production release.
        if (settings.staging && c.version && !c.staging) c.lastStagingResult = { metadata, at: new Date(clock()).toISOString() };
        else {
          c.version = version; c.metadata = metadata; c.staging = settings.staging;
          c.bundle = store.vault.seal({ ...result.bundle, version, ...metadata }, `bundle:${c.id}:${version}`);
        }
        c.workspace = store.vault.seal(result.workspace || {}, `workspace:${c.id}`);
        c.lastIssuedAt = new Date(clock()).toISOString(); c.lastError = null;
        const j = s.jobs.find(j => j.id === id); j.status = 'succeeded'; j.finishedAt = c.lastIssuedAt;
        audit(s, 'certificate_issued', c.domain);
      });
    } catch {
      await store.transaction(s => {
        const job = s.jobs.find(j => j.id === id); job.status = 'failed'; job.finishedAt = new Date(clock()).toISOString(); job.error = 'issuance_failed_check_configuration';
        const c = s.certificates.find(c => c.id === job.certificateId); if (c) c.lastError = job.error;
        audit(s, 'certificate_issue_failed', job.certificateId, 'failed');
      });
    }
  }
  async function enqueue(certificateId, automatic = false) {
    const result = await store.transaction(s => {
      const c = s.certificates.find(c => c.id === certificateId);
      if (!c) reject(404, 'certificate_not_found');
      const active = s.jobs.find(j => j.certificateId === certificateId && ['queued', 'running'].includes(j.status));
      if (active) return active;
      const recent = s.jobs.find(j => j.certificateId === certificateId && clock() - Date.parse(j.createdAt) < (automatic ? 21600000 : 60000));
      if (recent) { if (automatic) return null; reject(429, 'issuance_cooldown'); }
      const job = { id: random(16), certificateId, status: 'queued', createdAt: new Date(clock()).toISOString(), automatic };
      s.jobs.unshift(job); s.jobs = s.jobs.slice(0, 200); audit(s, 'issuance_queued', c.domain);
      return job;
    });
    if (result?.status === 'queued' && !workers.has(result.id)) {
      workers.add(result.id);
      jobQueue = jobQueue.catch(() => {}).then(() => issueJob(result.id)).finally(() => workers.delete(result.id));
      jobQueue.catch(() => {});
    }
    return result;
  }
  async function checkRenewals() {
    if (closing || enqueueing) return;
    enqueueing = true;
    try {
      for (const c of store.state.certificates) if (c.autoRenew && (!c.metadata || (c.staging && !store.state.settings.staging) || Date.parse(c.metadata.expiresAt) - clock() <= store.state.settings.renewalDays * 86400000)) await enqueue(c.id, true);
    } finally { enqueueing = false; }
  }
  async function handle(req, res) {
    try {
      if (closing) reject(503, 'server_shutting_down');
      const parsed = new URL(req.url, 'http://localhost'); const pathname = parsed.pathname; const method = req.method;
      const mutation = !['GET', 'HEAD'].includes(method);
      if (mutation && req.headers.origin && req.headers.origin !== origin) reject(403, 'origin_rejected');
      limit(`all:${req.socket.remoteAddress}`, 600, 60000);
      if (method === 'GET' && pathname === '/api/v1/health') return send(res, 200, { ok: true, service: 'certrelay', version: '0.2.0' });
      if (method === 'POST' && pathname === '/api/v1/auth/login') {
        limit(`login:${req.socket.remoteAddress}`, 10, 600000);
        const input = await body(req);
        if (typeof input.password !== 'string' || input.password.length > 1024) reject(401, 'invalid_password');
        const actual = await passwordHash(input.password, store.state.admin.salt);
        if (!equal(actual.digest, store.state.admin.digest)) reject(401, 'invalid_password');
        for (const [key, value] of sessions) if (value.until <= clock()) sessions.delete(key);
        if (sessions.size >= 16) sessions.delete(sessions.keys().next().value);
        const token = random(); const csrf = random();
        sessions.set(hash(token), { csrf, until: clock() + 43200000 });
        return send(res, 200, { csrf }, { 'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? '; Secure' : ''}` });
      }
      if (method === 'GET' && pathname === '/api/v1/auth/session') return send(res, 200, { csrf: session(req).csrf });
      if (method === 'POST' && pathname === '/api/v1/auth/logout') {
        sessions.delete(session(req, true).key);
        return send(res, 204, undefined, { 'Set-Cookie': `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}` });
      }
      if (pathname.startsWith('/api/v1/admin/')) {
        session(req, mutation);
        if (method === 'GET' && pathname === '/api/v1/admin/state') return send(res, 200, publicState());
        const input = mutation ? await body(req) : {};
        if (method === 'POST' && pathname === '/api/v1/admin/password') {
          assert(typeof input.currentPassword === 'string' && input.currentPassword.length <= 1024);
          assert(typeof input.newPassword === 'string' && input.newPassword.length >= 14 && input.newPassword.length <= 1024, 'password_too_short');
          const oldAdmin = store.state.admin;
          const actual = await passwordHash(input.currentPassword, oldAdmin.salt);
          if (!equal(actual.digest, oldAdmin.digest)) reject(401, 'invalid_password');
          const nextAdmin = await passwordHash(input.newPassword);
          await store.transaction(s => { if (!equal(s.admin.digest, oldAdmin.digest)) reject(409, 'password_changed'); s.admin = nextAdmin; audit(s, 'admin_password_changed', 'administrator'); });
          sessions.clear();
          return send(res, 204, undefined, { 'Set-Cookie': `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}` });
        }
        if (method === 'PATCH' && pathname === '/api/v1/admin/settings') {
          assert(Number.isInteger(input.renewalDays) && input.renewalDays >= 7 && input.renewalDays <= 60);
          assert(Number.isInteger(input.checkMinutes) && input.checkMinutes >= 5 && input.checkMinutes <= 1440);
          assert(typeof input.staging === 'boolean');
          assert(typeof input.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) && input.email.length <= 254, 'invalid_email');
          await store.transaction(s => {
            if (s.jobs.some(j => ['running', 'queued'].includes(j.status))) reject(409, 'issuance_in_progress');
            s.settings = { ...s.settings, renewalDays: input.renewalDays, checkMinutes: input.checkMinutes, staging: input.staging, email: input.email };
            audit(s, 'settings_updated', 'settings');
          });
          return send(res, 200, store.state.settings);
        }
        if (pathname === '/api/v1/admin/credentials' && method === 'POST') {
          assert(['cf', 'ali'].includes(input.provider));
          const name = text(input.name, 60); assert(name.length > 0);
          const secret = credentialSecret(input.provider, input.secret); const id = `dns-${random(8)}`;
          const created = await store.transaction(s => {
            if (s.credentials.some(c => c.name.toLowerCase() === name.toLowerCase())) reject(409, 'duplicate_name');
            const value = { id, name, provider: input.provider, note: text(input.note), updatedAt: new Date(clock()).toISOString(), secret: store.vault.seal(secret, `credential:${id}`) };
            s.credentials.push(value); audit(s, 'credential_created', id); return safeCredential(value);
          }); return send(res, 201, created);
        }
        const credentialMatch = pathname.match(/^\/api\/v1\/admin\/credentials\/(dns-[a-f0-9]{16})$/);
        if (credentialMatch && ['PATCH', 'DELETE'].includes(method)) {
          const id = credentialMatch[1];
          await store.transaction(s => {
            const c = s.credentials.find(c => c.id === id); if (!c) reject(404, 'credential_not_found');
            if (method === 'DELETE') {
              if (s.certificates.some(cert => cert.credentialId === id)) reject(409, 'credential_in_use');
              s.credentials = s.credentials.filter(c => c.id !== id);
            } else {
              const name = text(input.name, 60); assert(name.length > 0);
              if (s.credentials.some(other => other.id !== id && other.name.toLowerCase() === name.toLowerCase())) reject(409, 'duplicate_name');
              c.name = name; c.note = text(input.note); c.updatedAt = new Date(clock()).toISOString();
              if (input.secret) c.secret = store.vault.seal(credentialSecret(c.provider, input.secret), `credential:${id}`);
            }
            audit(s, method === 'DELETE' ? 'credential_deleted' : 'credential_updated', id);
          }); return send(res, 204);
        }
        if (pathname === '/api/v1/admin/certificates' && method === 'POST') {
          const raw = text(input.domain, 253).toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
          assert(!/[\s\/:@?#\\]/.test(raw)); const domain = domainToASCII(raw);
          assert(domain.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain), 'invalid_domain');
          const created = await store.transaction(s => {
            assert(s.credentials.some(c => c.id === input.credentialId), 'credential_required');
            if (s.certificates.some(c => c.domain === domain)) reject(409, 'duplicate_domain');
            const c = { id: `cert-${random(8)}`, domain, credentialId: input.credentialId, autoRenew: input.autoRenew !== false, createdAt: new Date(clock()).toISOString(), version: null, metadata: null };
            s.certificates.push(c); audit(s, 'certificate_created', domain); return c;
          }); return send(res, 201, created);
        }
        const issueMatch = pathname.match(/^\/api\/v1\/admin\/certificates\/(cert-[a-f0-9]{16})\/issue$/);
        if (issueMatch && method === 'POST') return send(res, 202, await enqueue(issueMatch[1]));
        const certificateMatch = pathname.match(/^\/api\/v1\/admin\/certificates\/(cert-[a-f0-9]{16})$/);
        if (certificateMatch && method === 'PATCH') {
          await store.transaction(s => {
            const c = s.certificates.find(c => c.id === certificateMatch[1]); if (!c) reject(404, 'certificate_not_found');
            if (s.jobs.some(j => j.certificateId === c.id && ['queued', 'running'].includes(j.status))) reject(409, 'issuance_in_progress');
            assert(typeof input.autoRenew === 'boolean'); assert(s.credentials.some(k => k.id === input.credentialId), 'credential_required');
            c.autoRenew = input.autoRenew; c.credentialId = input.credentialId; audit(s, 'certificate_updated', c.domain);
          }); return send(res, 204);
        }
        if (pathname === '/api/v1/admin/enrollments' && method === 'POST') {
          assert(validName(input.name), 'invalid_name');
          const created = await store.transaction(s => {
            if (s.agents.some(a => !a.revokedAt && a.name.toLowerCase() === input.name.toLowerCase()) || s.invitations.some(i => i.status === 'pending' && i.expiresAt > clock() && i.name.toLowerCase() === input.name.toLowerCase())) reject(409, 'duplicate_name');
            const code = String(randomInt(10000000, 100000000));
            const invitation = { id: random(16), agentId: `agent-${random(8)}`, name: input.name, label: text(input.label, 60), arch: ['amd64', 'arm64', 'armv7'].includes(input.arch) ? input.arch : 'amd64', certificateIds: ids(input.certificateIds || [], s), status: 'pending', codeHash: store.vault.code(code), attempts: 0, expiresAt: clock() + 600000 };
            s.invitations.unshift(invitation); s.invitations = s.invitations.slice(0, 200);
            audit(s, 'invitation_created', invitation.name);
            return { ...codeView(invitation), code, enrollment_url: `${origin}/enroll/${invitation.id}` };
          }); return send(res, 201, created);
        }
        const invitationMatch = pathname.match(/^\/api\/v1\/admin\/enrollments\/([a-f0-9]{32})\/revoke$/);
        if (invitationMatch && method === 'POST') {
          await store.transaction(s => {
            const i = s.invitations.find(i => i.id === invitationMatch[1]); if (!i) reject(404, 'invitation_not_found');
            if (i.status !== 'pending') reject(409, 'invitation_unavailable');
            i.status = 'revoked'; audit(s, 'invitation_revoked', i.name);
          }); return send(res, 204);
        }
        const regenerateMatch = pathname.match(/^\/api\/v1\/admin\/enrollments\/([a-f0-9]{32})\/regenerate$/);
        if (regenerateMatch && method === 'POST') {
          const result = await store.transaction(s => {
            const previous = s.invitations.find(i => i.id === regenerateMatch[1]);
            if (!previous) reject(404, 'invitation_not_found');
            if (previous.status === 'used' || s.agents.some(a => !a.revokedAt && a.name.toLowerCase() === previous.name.toLowerCase())) reject(409, 'already_registered');
            if (s.invitations.some(i => i.id !== previous.id && i.name === previous.name && i.status === 'pending' && i.expiresAt > clock())) reject(409, 'newer_invitation_exists');
            previous.status = 'revoked';
            const code = String(randomInt(10000000, 100000000));
            const invitation = { ...previous, id: random(16), agentId: previous.agentId, codeHash: store.vault.code(code), status: 'pending', attempts: 0, expiresAt: clock() + 600000 };
            s.invitations.unshift(invitation); s.invitations = s.invitations.slice(0, 200); audit(s, 'invitation_created', invitation.name);
            return { ...codeView(invitation), code, enrollment_url: `${origin}/enroll/${invitation.id}` };
          }); return send(res, 201, result);
        }
        const permissionsMatch = pathname.match(/^\/api\/v1\/admin\/agents\/(agent-[a-f0-9]{16})\/(permissions|revoke)$/);
        if (permissionsMatch && method === 'POST') {
          await store.transaction(s => {
            const a = s.agents.find(a => a.id === permissionsMatch[1]); if (!a) reject(404, 'agent_not_found');
            if (permissionsMatch[2] === 'revoke') { a.revokedAt = new Date(clock()).toISOString(); audit(s, 'agent_revoked', a.name); }
            else { if (a.revokedAt) reject(409, 'agent_revoked'); a.certificateIds = ids(input.certificateIds, s); audit(s, 'permissions_updated', a.name); }
          }); return send(res, 204);
        }
        const agentMatch = pathname.match(/^\/api\/v1\/admin\/agents\/(agent-[a-f0-9]{16})$/);
        if (agentMatch && method === 'PATCH') {
          await store.transaction(s => {
            const a = s.agents.find(a => a.id === agentMatch[1]); if (!a) reject(404, 'agent_not_found');
            const name = text(input.name, 48); assert(validName(name), 'invalid_name');
            if (s.agents.some(other => other.id !== a.id && !other.revokedAt && other.name.toLowerCase() === name.toLowerCase()) ||
                s.invitations.some(i => i.status === 'pending' && i.expiresAt > clock() && i.name.toLowerCase() === name.toLowerCase())) reject(409, 'duplicate_name');
            a.name = name; a.label = text(input.label, 60); audit(s, 'agent_updated', a.name);
          }); return send(res, 204);
        }
        if (pathname === '/api/v1/admin/check-renewals' && method === 'POST') { await checkRenewals(); return send(res, 202, { ok: true }); }
        reject(404, 'not_found');
      }
      if (method === 'GET' && /^\/enroll\/[a-f0-9]{32}$/.test(pathname)) {
        const i = store.state.invitations.find(i => i.id === pathname.split('/').at(-1));
        return send(res, i && i.status === 'pending' && i.expiresAt > clock() ? 200 : 410, { active: !!i && i.status === 'pending' && i.expiresAt > clock(), instruction: 'Use the CLI with the separate one-time verification code.' });
      }
      const claimMatch = pathname.match(/^\/api\/v1\/enrollments\/([a-f0-9]{32})\/claim$/);
      if (method === 'POST' && claimMatch) {
        limit(`claim:${req.socket.remoteAddress}`, 60, 60000);
        const input = await body(req);
        const result = await store.transaction(s => {
          const invitation = s.invitations.find(i => i.id === claimMatch[1]);
          if (!invitation || invitation.status !== 'pending') return { status: 410, code: 'invitation_unavailable' };
          if (invitation.expiresAt <= clock()) { invitation.status = 'expired'; return { status: 410, code: 'invitation_expired' }; }
          invitation.attempts++;
          const supplied = String(input.code || '').replace(/\s/g, '');
          if (!/^\d{8}$/.test(supplied) || !equal(store.vault.code(supplied), invitation.codeHash)) {
            if (invitation.attempts >= 5) invitation.status = 'locked';
            return { status: 401, code: 'invalid_code' };
          }
          const token = random(); invitation.status = 'used';
          const a = { id: invitation.agentId, name: invitation.name, label: invitation.label, arch: text(input.arch || invitation.arch, 20), hostname: text(input.name, 80), os: text(input.os), certificateIds: invitation.certificateIds, tokenHash: hash(token), createdAt: new Date(clock()).toISOString(), lastSeen: new Date(clock()).toISOString(), receipts: {} };
          s.agents.push(a); audit(s, 'agent_enrolled', a.name);
          return { status: 201, body: { agent_id: a.id, agent_token: token, server_url: origin, protocol_version: 1 } };
        }); return send(res, result.status, result.body || { error: { code: result.code } });
      }
      if (pathname.startsWith('/api/v1/agent/')) {
        const a = agent(req);
        if (method === 'POST' && pathname === '/api/v1/agent/heartbeat') {
          await body(req); await store.transaction(s => { agent(req, s).lastSeen = new Date(clock()).toISOString(); }); return send(res, 204);
        }
        if (method === 'GET' && pathname === '/api/v1/agent/manifest') {
          return send(res, 200, { protocol_version: 1, certificates: store.state.certificates.filter(c => a.certificateIds.includes(c.id) && c.version).map(c => ({ id: c.id, domain: c.domain, version: c.version, staging: c.staging, ...c.metadata })) });
        }
        const bundleMatch = pathname.match(/^\/api\/v1\/agent\/certificates\/(cert-[a-f0-9]{16})\/([a-f0-9]{32})$/);
        if (bundleMatch && method === 'GET') {
          const c = store.state.certificates.find(c => c.id === bundleMatch[1]);
          if (!c || !a.certificateIds.includes(c.id)) reject(403, 'certificate_forbidden');
          if (c.version !== bundleMatch[2]) reject(409, 'version_changed');
          return send(res, 200, store.vault.unseal(c.bundle, `bundle:${c.id}:${c.version}`));
        }
        if (pathname === '/api/v1/agent/receipts' && method === 'POST') {
          const input = await body(req);
          await store.transaction(s => {
            const a = agent(req, s); const c = s.certificates.find(c => c.id === input.certificateId);
            if (!c || !a.certificateIds.includes(c.id)) reject(403, 'certificate_forbidden');
            assert(c.version === input.version && ['installed', 'failed'].includes(input.status), 'invalid_receipt');
            if (input.status === 'installed') assert(input.fingerprint === c.metadata.fingerprint, 'fingerprint_mismatch');
            const receipt = { version: c.version, status: input.status, fingerprint: input.status === 'installed' ? input.fingerprint : null, at: new Date(clock()).toISOString(), reason: input.status === 'failed' ? 'client_install_failed' : undefined };
            a.receipts[c.id] = receipt; a.lastSeen = receipt.at;
            audit(s, input.status === 'installed' ? 'certificate_installed' : 'certificate_install_failed', `${a.name}:${c.domain}`, input.status === 'installed' ? 'success' : 'failed');
          }); return send(res, 204);
        }
        reject(404, 'not_found');
      }
      const file = files.get(pathname);
      if (!file || !['GET', 'HEAD'].includes(method)) reject(404, 'not_found');
      let content = await readFile(path.join(root, file[0]));
      if (file[0] === 'index.html') content = Buffer.from(content.toString().replace('</head>', '<link rel="stylesheet" href="/src/live.css"></head>'));
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      res.end(method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!res.headersSent) send(res, error.status || 500, { error: { code: error.code || 'internal_error', request_id: random(8) } });
      else res.end();
    }
  }
  const server = http.createServer(handle);
  server.headersTimeout = 10000; server.requestTimeout = 20000; server.maxConnections = 100;
  let nextCheck = 0;
  const timer = schedule ? setInterval(() => {
    if (clock() >= nextCheck) { nextCheck = clock() + store.state.settings.checkMinutes * 60000; checkRenewals().catch(() => {}); }
  }, 30000) : null;
  timer?.unref();
  return { server, store, enqueue, checkRenewals, publicState,
    listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(server.address())); }),
    idle: () => jobQueue,
    close: async () => { closing = true; clearInterval(timer); server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); await jobQueue.catch(() => {}); await store.close(); },
  };
}
