#!/usr/bin/env node
/**
 * `npm run web:real` — web build on localhost WITH real data.
 * Starts the local proxy (scripts/web-proxy/server.ts, 127.0.0.1:8787, run by the pinned local `tsx`)
 * and `expo start --web --localhost --clear --port 8081` together. A random one-run secret is generated
 * here and handed to both, so no token has to be pasted; `--clear` empties Metro's cache so a cached bundle
 * can never carry the token of a previous run, and `--localhost` keeps the bundle (which embeds the
 * token) unreachable from the LAN. Nothing is written to disk. Stop everything with Ctrl-C (closing
 * either process stops the other one; the exit code is propagated). Both ports must be free: the script
 * exits with a message instead of silently switching port.
 *
 * Optional RAW mode, to inspect the real upstream calls in Chrome DevTools > Network (filter `/raw-log`):
 *   npm run web:real -- --raw
 * Off by default. The proxy then keeps in memory the last 40 upstream calls (URL without query, status,
 * ms and the full body of vehicle-data GETs). Those bodies contain personal data: do not share them.
 * Passwords, tokens, cookies, x-api-key, PIN and login/PIN/command bodies are never recorded.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { isPortFree } from './port-check.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const proxyPort = 8787;
const webPort = 8081;
const raw = process.argv.includes('--raw');

// Same addresses the real processes use: the proxy binds 127.0.0.1, Expo --localhost binds 127.0.0.1 and ::1.
for (const [port, hosts, what] of [[webPort, ['127.0.0.1', '::1'], 'Expo (web)'], [proxyPort, ['127.0.0.1'], 'il proxy locale']]) {
  if (!(await isPortFree(port, hosts))) {
    console.error(`La porta ${port} è occupata: serve libera per ${what}. Chiudi il processo che la usa e riprova.`);
    process.exit(1);
  }
}

const token = randomBytes(24).toString('hex');
const env = {
  ...process.env,
  PROXY_TOKEN: token,
  PROXY_PORT: String(proxyPort),
  WEB_PORT: String(webPort),
  ...(raw ? { PROXY_RAW: '1' } : {}),
  EXPO_PUBLIC_PROXY_URL: `http://127.0.0.1:${proxyPort}`,
  EXPO_PUBLIC_PROXY_TOKEN: token,
  TSX_TSCONFIG_PATH: 'scripts/web-proxy/tsconfig.json',
};
console.log(`Quando Expo è pronto apri http://localhost:${webPort} (non 127.0.0.1: Metro con --localhost ascolta su localhost).`);
if (raw) console.warn('ATTENZIONE: modalità RAW attiva. Le risposte in /raw-log contengono dati personali: non condividerle.');

// Run the local binaries directly: nothing is downloaded at run time.
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'scripts/web-proxy/server.ts'], { cwd: root, env, stdio: 'inherit' }),
  spawn(`${root}node_modules/.bin/expo`, ['start', '--web', '--localhost', '--clear', '--port', String(webPort)], { cwd: root, env, stdio: 'inherit' }),
];

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill('SIGTERM'));
};
children.forEach((c) =>
  c.on('exit', (code) => {
    stop();
    // Keep the first meaningful failure: the sibling we kill exits with null and must not reset it.
    if (!process.exitCode && code) process.exitCode = code;
  }),
);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
process.on('exit', stop);
