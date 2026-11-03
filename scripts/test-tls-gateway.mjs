// Isolated deployment-test ingress. Never proxy administration or UI to the Internet.
import https from 'node:https';
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const allowed = new Set((process.env.CERTRELAY_TEST_ALLOWED_IPS || '').split(',').filter(Boolean));
if (!allowed.size) throw new Error('CERTRELAY_TEST_ALLOWED_IPS is required');
const options = {
  key: await readFile(process.env.CERTRELAY_TEST_TLS_KEY),
  cert: await readFile(process.env.CERTRELAY_TEST_TLS_CERT),
  minVersion: 'TLSv1.2',
};
const permitted = (method, pathname) => (
  method === 'GET' && (pathname === '/api/v1/health' || /^\/enroll\/[a-f0-9]{32}$/.test(pathname))
) || (
  method === 'POST' && (pathname === '/api/v1/agent/heartbeat' || /^\/api\/v1\/enrollments\/[a-f0-9]{32}\/claim$/.test(pathname))
);
const server = https.createServer(options, (request, response) => {
  const ip = request.socket.remoteAddress?.replace(/^::ffff:/, '');
  const pathname = new URL(request.url, 'https://localhost').pathname;
  if (!allowed.has(ip) || !permitted(request.method, pathname)) {
    response.writeHead(403, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' });
    response.end('Forbidden');
    request.resume();
    return;
  }
  if (request.headers['content-length'] && Number(request.headers['content-length']) > 16384) {
    response.writeHead(413); response.end(); request.resume(); return;
  }
  const upstream = http.request({
    host: '127.0.0.1', port: Number(process.env.CERTRELAY_PORT || 18473),
    method: request.method, path: pathname,
    headers: {
      ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  }, (incoming) => {
    response.writeHead(incoming.statusCode, incoming.headers);
    incoming.pipe(response);
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > 16384) { upstream.destroy(); request.destroy(); }
  });
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => upstream.destroy());
  request.pipe(upstream);
});
server.headersTimeout = 10000;
server.requestTimeout = 20000;
server.maxConnections = 32;
server.on('tlsClientError', () => {});
server.listen(Number(process.env.CERTRELAY_TEST_TLS_PORT || 18443), '0.0.0.0', () => {
  console.log('CertRelay restricted TLS test ingress ready');
});
