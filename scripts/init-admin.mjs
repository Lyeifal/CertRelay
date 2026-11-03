#!/usr/bin/env node
import { runAdminCommand, parseAdminArgs } from '../shared/admin-cli.mjs';
try { await runAdminCommand('init', parseAdminArgs(process.argv.slice(2))); }
catch (error) { console.error(`certrelay-init: ${error.message}`); process.exitCode = 1; }
