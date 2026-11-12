// Dependency-free validator for the JSON Schema subset used by the E2E contract schemas.
// Supported: $ref (#/$defs/...), type, const, enum, required, properties, additionalProperties:false,
// items, contains, minItems, maxItems, uniqueItems, minLength, pattern, minimum, allOf, anyOf, if/then/else.
// Unsupported keywords throw, so a schema can never silently pass an unchecked rule.
const SUPPORTED = new Set(['$schema', '$id', 'title', 'description', '$defs', '$ref', 'type', 'const', 'enum', 'required',
  'properties', 'additionalProperties', 'items', 'contains', 'minItems', 'maxItems', 'uniqueItems', 'minLength',
  'pattern', 'minimum', 'allOf', 'anyOf', 'if', 'then', 'else']);

const typeOf = value => value === null ? 'null' : Array.isArray(value) ? 'array'
  : Number.isInteger(value) ? 'integer' : typeof value;
const typeMatches = (value, type) => type === 'number' ? typeof value === 'number' : typeOf(value) === type;

export function validate(schema, value, root = schema, at = '$') {
  const errors = [];
  for (const key of Object.keys(schema)) if (!SUPPORTED.has(key)) throw new Error(`Unsupported schema keyword "${key}" at ${at}`);
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/\$defs\//, '');
    if (!root.$defs?.[name]) throw new Error(`Unresolved $ref ${schema.$ref}`);
    errors.push(...validate(root.$defs[name], value, root, at));
  }
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some(t => typeMatches(value, t))) return [...errors, `${at}: expected ${types.join('|')}, got ${typeOf(value)}`];
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${at}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(value))) errors.push(`${at}: must be one of ${schema.enum.map(e => JSON.stringify(e)).join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
  }
  if (typeof value === 'number' && schema.minimum != null && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${at}: fewer than ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) errors.push(`${at}: items not unique`);
    if (schema.items) value.forEach((item, i) => errors.push(...validate(schema.items, item, root, `${at}[${i}]`)));
    if (schema.contains && !value.some(item => validate(schema.contains, item, root, at).length === 0)) errors.push(`${at}: no item matches "contains"`);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}: missing required "${key}"`);
    for (const [key, sub] of Object.entries(schema.properties ?? {})) if (key in value) errors.push(...validate(sub, value[key], root, `${at}.${key}`));
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (schema.properties ?? {}))) errors.push(`${at}: unexpected property "${key}"`);
    }
  }
  for (const sub of schema.allOf ?? []) errors.push(...validate(sub, value, root, at));
  if (schema.anyOf && !schema.anyOf.some(sub => validate(sub, value, root, at).length === 0)) errors.push(`${at}: matches no "anyOf" branch`);
  if (schema.if) {
    const branch = validate(schema.if, value, root, at).length === 0 ? schema.then : schema.else;
    if (branch) errors.push(...validate(branch, value, root, at));
  }
  return errors;
}
