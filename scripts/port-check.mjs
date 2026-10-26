/**
 * Port availability probe for the web:real launcher. A wildcard bind is NOT enough: on macOS it succeeds
 * even when another process holds the same port on a specific address (127.0.0.1 or ::1). So for every
 * address the real processes will use we (1) try a TCP connect, a listener there means "occupied", and
 * (2) try to bind that exact address. An address family the machine does not support (no ::1) is skipped.
 */
import { connect, createServer } from 'node:net';

const accepts = (host, port) =>
  new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });

/** 'free' | 'busy' | 'unsupported' (address family not available here). */
const bindState = (host, port) =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', (e) => resolve(e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT' ? 'unsupported' : 'busy'));
    probe.listen({ host, port }, () => probe.close(() => resolve('free')));
  });

export async function isPortFree(port, hosts) {
  for (const host of hosts) {
    if ((await bindState(host, port)) === 'unsupported') continue;
    if (await accepts(host, port)) return false;
    if ((await bindState(host, port)) === 'busy') return false;
  }
  return true;
}
