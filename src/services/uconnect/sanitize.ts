/**
 * Sanitizer for diagnostics: turns an API response into its STRUCTURE (key paths, value types,
 * units and enums from a small allowlist) without any personal value. TypeScript port of the
 * approved rules in scripts/probe-uconnect.mjs (shapeOf / mergeShapes), plus a last-line redaction.
 */

type Shape = string | { [key: string]: Shape } | { _array: number; _item: Shape } | { _misto: Shape[] };

/**
 * ALLOWLIST of keys whose value may be shown (units, scales, codes). Anything else shows only its type,
 * whatever it looks like: a free-text field must never leak because its value "looks like an enum".
 */
const VALUE_KEYS = new Set([
  'unit', 'type', 'status', 'state', 'service', 'sdp', 'fuelType', 'make', 'model', 'year', 'soldRegion',
  'fuelAmountLevel', 'oilLevel', 'batteryStateOfCharge', 'batteryStatus', 'ignitionStatus', 'chargePowerPreference', 'chargingStatus',
]);
/** Parents whose `value` (a pressure or a voltage) is needed to understand the scale. */
const VALUE_PARENTS = new Set(['pressure', 'batteryVoltage']);
/** A shown string is a short code: no spaces, so names and sentences are out; only a model name may contain spaces. */
const SAFE_CODE = /^[A-Za-z0-9._/-]{1,24}$/;
const SAFE_MODEL = /^[A-Za-z0-9 ._/-]{1,24}$/;
/** Object keys are shown only if they look like plain field names; anything else (ids, VINs, free text) becomes <id>. */
const SAFE_KEY = /^[a-z][A-Za-z]{1,40}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Shapes are prototype-less so a "__proto__" key cannot alter anything (it is replaced by <id> anyway). */
const newShape = () => Object.create(null) as Record<string, Shape>;

/** Replaces values with a type description; keeps allow-listed non-personal values. */
export function shapeOf(value: unknown, key = '', parentKey = ''): Shape {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((item) => shapeOf(item, key, parentKey));
    return { _array: value.length, _item: items.length ? items.reduce(mergeShapes) : 'vuoto' };
  }
  if (isObject(value)) {
    return Object.entries(value).reduce<Record<string, Shape>>((out, [k, v]) => {
      const name = SAFE_KEY.test(k) ? k : '<id>';
      const shape = shapeOf(v, name, key);
      out[name] = name in out ? mergeShapes(out[name], shape) : shape;
      return out;
    }, newShape());
  }
  const type = typeof value;
  if (type === 'boolean') return 'boolean';
  // Date-like fields: only the number of digits (10 = seconds, 13 = milliseconds), never the value.
  if (/time|date|stamp/i.test(key) && /^\d+$/.test(String(value))) return `${type} (${String(value).length} cifre)`;
  const allowed = VALUE_KEYS.has(key) || (key === 'value' && VALUE_PARENTS.has(parentKey));
  if (allowed && type === 'number' && Number.isFinite(value)) return `number = ${value}`;
  if (allowed && type === 'string' && (key === 'model' ? SAFE_MODEL : SAFE_CODE).test(value as string)) return `string = ${redact(value as string)}`;
  return type;
}

/** Union of two shapes (array items can differ): objects merge key by key, leaves are joined. */
export function mergeShapes(a: Shape, b: Shape): Shape {
  if (isObject(a) && isObject(b)) {
    const out = newShape();
    Object.assign(out, a);
    for (const [k, v] of Object.entries(b as Record<string, Shape>)) out[k] = k in out ? mergeShapes(out[k], v) : v;
    return out;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return [...new Set([...a.split(' | '), ...b.split(' | ')])].join(' | ');
  }
  return JSON.stringify(a) === JSON.stringify(b) ? a : { _misto: [a, b] };
}

/** Defence in depth on any text that leaves the app: VIN-like, e-mail, JWT-like and long token-like strings. */
export function redact(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<redatto>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<redatto>')
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, '<redatto>')
    .replace(/[A-Za-z0-9+/=_-]{32,}/g, '<redatto>');
}

export const MAX_STRUCTURE_CHARS = 8000;

/** Pretty-printed, redacted and truncated structure text. */
export function structureText(json: unknown): { text: string; shape: Shape } {
  const shape = shapeOf(json);
  let text = redact(JSON.stringify(shape, null, 2) ?? 'null');
  if (text.length > MAX_STRUCTURE_CHARS) text = `${text.slice(0, MAX_STRUCTURE_CHARS)}\n… (troncato)`;
  return { text, shape };
}

/** True if the shape holds at least one non-null leaf. */
function hasValue(shape: unknown): boolean {
  if (typeof shape === 'string') return shape !== 'null' && shape !== 'vuoto';
  if (typeof shape !== 'object' || shape === null) return false;
  return Object.values(shape).some(hasValue);
}

/** Whether a key whose NAME matches `pattern` exists with a non-null value somewhere in the shape. */
export function hasKeyWithValue(shape: unknown, pattern: RegExp): boolean {
  if (!isObject(shape)) return false;
  return Object.entries(shape).some(([k, v]) => (pattern.test(k) && hasValue(v)) || hasKeyWithValue(v, pattern));
}

/** Exact field names only: a label states what the key proves (its name has a non-null value), nothing more. */
const STATUS_FIELDS: [string, RegExp][] = [
  ['Chilometraggio (odometer)', /^odometer$/],
  ['Livello carburante (fuelAmountLevel)', /^fuelAmountLevel$/],
  ['Olio (oilLevel)', /^oilLevel$/],
  ['Pressioni pneumatici (tyrePressure)', /^tyrePressure$/],
  ['Tensione batteria 12 V (batteryVoltage)', /^batteryVoltage$/],
  ['Prossimo tagliando (daysToService / distanceToService)', /^(daysToService|distanceToService)$/],
];

/** "presente (valore non nullo)" / "assente" per field, from the sanitized shape only. */
export function presenceSummary(kind: string, shape: Shape): string[] {
  if (kind === 'vhr') return [`Rapporto di salute (vhr): ${hasValue(shape) ? 'contiene dati' : 'vuoto'}`];
  if (kind !== 'status') return [];
  return STATUS_FIELDS.map(([label, pattern]) => `${label}: ${hasKeyWithValue(shape, pattern) ? 'presente (valore non nullo)' : 'assente'}`);
}
