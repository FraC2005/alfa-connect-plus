// three's CommonJS entry (node_modules/three/build/three.cjs) calls `process.emitWarning(...)` at module
// scope to announce its own deprecation (three is moving to ESM-only). React Native's Hermes runtime
// ships a minimal `process` global (just `process.env.NODE_ENV`) with no `emitWarning`, so that call
// throws `TypeError: undefined is not a function` the moment three.cjs is required — which, via
// @react-three/fiber/native → car-3d-view.tsx → services.tsx, takes down the whole expo-router tab
// navigator (services.tsx loses its default export), not just the "Servizi" screen.
// Import this file before any `three`/`@react-three/fiber`/`@react-three/drei` import so the no-op
// stand-in is in place first; static imports run top-to-bottom in source order.
if (typeof globalThis.process === 'undefined') {
  (globalThis as any).process = {};
}
if (typeof (globalThis.process as any).emitWarning !== 'function') {
  (globalThis.process as any).emitWarning = () => {};
}
