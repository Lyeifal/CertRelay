import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.CERTRELAY_PORT || 4173);
const statePath = process.env.CERTRELAY_STATE_PATH || path.join(root, '.certrelay-dev-state.json');
const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/src/app.js', ['src/app.js', 'text/javascript; charset=utf-8']],
  ['/src/styles.css', ['src/styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

const randomHex = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
const randomCode = () => crypto.randomInt(10000000, 100000000).toString();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const timestamp = () => Date.now();
const publicOrigin = () => process.env.CERTRELAY_PUBLIC_URL || `http://127.0.0.1:${port}`;
const errorBody = (code, message) => ({ error: { code, message, request_id: randomHex(8) } });
const defaultState = () => ({
  settings: { publicUrl: publicOrigin(), invitationTtlSeconds: 600, maxEnrollmentAttempts: 5 },
  invitations: [],
  agents: [],
  credentials: [],
});

let state;
try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  state = defaultState();
}
state.settings = { ...defaultState().settings, ...(state.settings || {}) };
state.invitations = Array.isArray(state.invitations) ? state.invitations : [];
state.agents = Array.isArray(state.agents) ? state.agents : [];
state.credentials = Array.isArray(state.credentials) ? state.credentials : [];
let writeQueue = Promise.resolve();

function persist() {
  writeQueue = writeQueue.then(async () => {
    await mkdir(path.dirname(statePath), { recursive: true });
    const temp = `${statePath}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, statePath);
  });
  return writeQueue;
}

function sendJson(response, status, body, extra = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

async function bodyOf(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('invalid_json'); }
}

function invitationView(invitation) {
  return {
    invitation_id: invitation.id,
    agent_id: invitation.agentId,
    name: invitation.name,
    expires_at: new Date(invitation.expiresAt).toISOString(),
    status: invitation.status,
    attempts: invitation.attempts,
    max_attempts: invitation.maxAttempts,
  };
}

function claim(invitation, request) {
  if (!invitation || invitation.status !== 'pending') return { status: 410, body: errorBody('invitation_unavailable', '此登记邀请已失效或已经使用。') };
  if (timestamp() >= invitation.expiresAt) {
    invitation.status = 'expired';
    return { status: 410, body: errorBody('invitation_expired', '此登记邀请已过期。') };
  }
  if (invitation.attempts >= invitation.maxAttempts) {
    invitation.status = 'locked';
    return { status: 410, body: errorBody('invitation_locked', '此登记邀请失败次数已达上限。') };
  }
  const supplied = String(request.code || '').replace(/\s+/g, '');
  invitation.attempts += 1;
  const validShape = /^\d{8}$/.test(supplied);
  const matches = validShape && crypto.timingSafeEqual(Buffer.from(hash(supplied)), Buffer.from(invitation.code_hash));
  if (!matches) {
    if (invitation.attempts >= invitation.maxAttempts) invitation.status = 'locked';
    return { status: 401, body: errorBody('invalid_code', '验证码不正确。') };
  }
  const token = randomHex(32);
  const agent = {
    id: invitation.agentId,
    name: invitation.name,
    label: invitation.label,
    arch: invitation.arch,
    status: 'online',
    created_at: new Date(timestamp()).toISOString(),
    last_seen: new Date(timestamp()).toISOString(),
    token_hash: hash(token),
  };
  invitation.status = 'used';
  invitation.used_at = new Date(timestamp()).toISOString();
  state.agents.push(agent);
  return { status: 201, body: { agent_id: agent.id, agent_token: token, server_url: invitation.origin, protocol_version: 1 } };
}

async function api(request, response, pathname) {
  const segments = pathname.split('/').filter(Boolean);
  try {
    if (request.method === 'GET' && segments[0] === 'enroll' && segments.length === 2) {
      const invitation = state.invitations.find((item) => item.id === segments[1]);
      const active = invitation?.status === 'pending' && timestamp() < invitation.expiresAt;
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
      response.end(`<!doctype html><meta charset="utf-8"><title>CertRelay 客户端登记</title><style>body{font-family:system-ui,sans-serif;max-width:38rem;margin:5rem auto;padding:0 1.5rem;color:#304c41;background:#f7f9f8}main{background:white;border:1px solid #e5ece6;border-radius:12px;padding:2rem}h1{font-size:1.4rem}p{line-height:1.8;color:#708277}.status{padding:.8rem 1rem;border-radius:8px;background:${active ? '#edf7ef' : '#fff5ed'};color:${active ? '#4f8460' : '#a36f4f'}}</style><main><h1>CertRelay 客户端登记</h1><p class="status">${active ? '登记邀请有效，请回到目标服务器的 CLI 输入验证码。' : '这份登记邀请已过期、撤销或已经使用。'}</p><p>该页面不会显示验证码，也不会领取客户端令牌。请使用管理员提供的验证码完成一次性登记。</p></main>`);
      return;
    }
    if (request.method === 'GET' && pathname === '/api/v1/health') {
      return sendJson(response, 200, { ok: true, service: 'certrelay', time: new Date().toISOString() });
    }
    // This local endpoint is intentionally for development only. Production must add admin auth.
    if (request.method === 'GET' && pathname === '/api/v1/admin/state') {
      return sendJson(response, 200, {
        settings: state.settings,
        invitations: state.invitations.map(invitationView),
        agents: state.agents.map(({ token_hash, ...agent }) => agent),
        credentials: state.credentials.map(({ secret, ...credential }) => credential),
      });
    }
    if (request.method === 'POST' && segments.join('/') === 'api/v1/admin/enrollments') {
      const requestBody = await bodyOf(request);
      const name = String(requestBody.name || '').trim();
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,47}$/.test(name)) return sendJson(response, 422, errorBody('invalid_name', '客户端名称格式不正确。'));
      const duplicate = state.agents.some((agent) => agent.name.toLowerCase() === name.toLowerCase()) || state.invitations.some((item) => item.status === 'pending' && item.name.toLowerCase() === name.toLowerCase());
      if (duplicate) return sendJson(response, 409, errorBody('name_taken', '客户端名称已经存在。'));
      const code = randomCode();
      const invitation = {
        id: randomHex(16), agentId: `agent-${randomHex(8)}`, name,
        label: String(requestBody.label || '').trim().slice(0, 60),
        arch: String(requestBody.arch || 'amd64'), origin: state.settings.publicUrl,
        code_hash: hash(code), status: 'pending', attempts: 0,
        maxAttempts: Number(state.settings.maxEnrollmentAttempts || 5),
        createdAt: timestamp(), expiresAt: timestamp() + Number(state.settings.invitationTtlSeconds || 600) * 1000,
      };
      state.invitations.push(invitation);
      await persist();
      return sendJson(response, 201, { ...invitationView(invitation), enrollment_url: `${invitation.origin.replace(/\/$/, '')}/enroll/${invitation.id}`, code });
    }
    if (request.method === 'POST' && segments[0] === 'api' && segments[1] === 'v1' && segments[2] === 'enrollments' && segments[4] === 'claim') {
      const invitation = state.invitations.find((item) => item.id === segments[3]);
      const result = claim(invitation, await bodyOf(request));
      await persist();
      return sendJson(response, result.status, result.body);
    }
    if (request.method === 'POST' && pathname === '/api/v1/agent/heartbeat') {
      const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const agent = state.agents.find((item) => item.token_hash === hash(token));
      if (!agent) return sendJson(response, 401, errorBody('unauthorized', '客户端身份无效。'));
      agent.last_seen = new Date(timestamp()).toISOString(); agent.status = 'online'; await persist();
      return sendJson(response, 204);
    }
    return sendJson(response, 404, errorBody('not_found', '未找到请求资源。'));
  } catch (error) {
    const known = error.message === 'body_too_large' || error.message === 'invalid_json';
    return sendJson(response, known ? 400 : 500, errorBody(known ? error.message : 'internal_error', known ? '请求格式不正确。' : '服务端暂时无法处理请求。'));
  }
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/') || pathname.startsWith('/enroll/')) return api(request, response, pathname);
  const file = publicFiles.get(pathname);
  if (!file || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); return;
  }
  try {
    const content = await readFile(path.join(root, file[0]));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(500); response.end('Unable to read application file'); }
});
server.listen(port, '127.0.0.1', () => console.log(`CertRelay UI/API: http://127.0.0.1:${port}`));
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
export { server };
