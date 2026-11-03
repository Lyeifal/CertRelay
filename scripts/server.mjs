#!/usr/bin/env node
import path from 'node:path';
import { createApplication } from '../server/application.mjs';

const app = await createApplication({
  directory: path.resolve(process.env.CERTRELAY_DATA_DIR || 'data'),
  publicUrl: process.env.CERTRELAY_PUBLIC_URL || 'http://127.0.0.1:4173',
  host: process.env.CERTRELAY_HOST || '127.0.0.1',
  port: Number(process.env.CERTRELAY_PORT || 4173),
  allowLocalHttp: process.env.CERTRELAY_ALLOW_LOCAL_HTTP === '1',
});
await app.listen();
console.log('CertRelay started on loopback; use an HTTPS reverse proxy for production.');
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (!stopping) { stopping = true; await app.close(); } });
