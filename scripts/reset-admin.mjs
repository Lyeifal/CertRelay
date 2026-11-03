#!/usr/bin/env node
// Offline recovery: the store lock requires the server to be stopped first.
import { runAdminCommand, parseAdminArgs } from '../shared/admin-cli.mjs';
try { await runAdminCommand('reset', parseAdminArgs(process.argv.slice(2))); }
catch (error) { console.error(`certrelay-reset-password: ${error.message}`); process.exitCode = 1; }
