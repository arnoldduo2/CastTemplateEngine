export interface PropSpec {
  name: string;
  type: string | null;
  description: string;
  required: boolean;
  default: string | null;
  values: string[];
  kind: 'bool' | 'number' | 'string' | 'other';
  deprecated: boolean | string;
  inferred: boolean;
  documented?: boolean;
}

export function newProp(name: string): PropSpec {
  return { name, type: null, description: '', required: false, default: null, values: [], kind: 'other', deprecated: false, inferred: false };
}

/** The type at the start of `text`: balanced <>, (), {}, quotes; unions may have spaces around | and &. */
export function readType(text: string): { type: string | null; rest: string } {
  let i = 0;
  let depth = 0;
  let quote: string | null = null;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if ('<({['.includes(c)) {
      depth++;
    } else if ('>)}]'.includes(c)) {
      depth--;
    } else if (/\s/.test(c) && depth <= 0) {
      // a space ends the type unless a | or & joins the next part
      const rest = text.slice(i).trimStart();
      const before = text.slice(0, i).trimEnd();
      if (/^[|&]/.test(rest) || /[|&:]$/.test(before)) {
        // a return type after `):` continues the type
        i++;
        continue;
      }
      break;
    }
    i++;
  }
  return { type: text.slice(0, i).trim() || null, rest: text.slice(i) };
}

export function splitUnion(type: string | null): string[] {
  if (!type) return [];
  let t = type.trim();
  if (t.startsWith('?')) t = t.slice(1) + '|null';
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if ('<({['.includes(c)) depth++;
    else if ('>)}]'.includes(c)) depth--;
    else if (c === '|' && depth === 0) {
      parts.push(t.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(t.slice(start).trim());
  return parts.filter(Boolean);
}

export function stripQuotes(t: string): string | null {
  const m = /^(['"])(.*)\1$/.exec(t);
  return m ? m[2] : null;
}

export function kindOf(type: string | null, defaultExpression: string | null): PropSpec['kind'] {
  const types = splitUnion(type).filter((t) => !/^null$/i.test(t));
  if (types.length) {
    if (types.every((t) => /^(bool|boolean|true|false)$/i.test(t))) return 'bool';
    if (types.every((t) => /^(int|integer|float|double|numeric|positive-int|negative-int|int<.*>)$/i.test(t))) return 'number';
    if (types.every((t) => /^(string|non-empty-string|class-string|numeric-string)$/i.test(t) || stripQuotes(t) !== null)) return 'string';
    return 'other';
  }
  // no type: guess from the default
  const d = (defaultExpression || '').trim();
  if (/^(true|false)$/i.test(d)) return 'bool';
  if (/^-?\d+(\.\d+)?$/.test(d)) return 'number';
  if (/^(['"]).*\1$/.test(d)) return 'string';
  return 'other';
}

/** Quoted or backticked words after "e.g.", "one of", "such as", "values:" or inside the first parentheses. */
export function valuesFromDescription(description: string): string[] {
  if (!description) return [];
  let region: string | null = null;
  const lead = /(?:\be\.g\.?,?|\bone of|\bsuch as|\bvalues?:|\boptions?:|\bpossible values?:)\s*([\s\S]*)$/i.exec(description);
  if (lead) region = lead[1];
  else {
    const paren = /\(([^)]*)\)/.exec(description);
    if (paren) region = paren[1];
  }
  if (!region) return [];
  const values: string[] = [];
  const re = /"([^"]+)"|'([^']+)'|`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(region))) {
    const v = m[1] ?? m[2] ?? m[3];
    if (!values.includes(v)) values.push(v);
  }
  return values.length <= 20 ? values : [];
}

/** Fill in what follows from the type and the description: required, kind, allowed values, deprecation. */
export function finish(prop: PropSpec): void {
  const types = splitUnion(prop.type);
  const optionalType = types.some((t) => /^(null|mixed)$/i.test(t)) || (prop.type || '').startsWith('?');
  if (prop.documented) {
    prop.kind = kindOf(prop.type, prop.default);
    // a flag that is left out is simply false, so a bool is never required
    prop.required = !(optionalType || prop.default !== null || /\[optional\]/i.test(prop.description) || prop.kind === 'bool');
  } else {
    prop.required = false;
    prop.kind = kindOf(prop.type, prop.default);
  }

  const literals = types.map(stripQuotes).filter((t): t is string => t !== null);
  const nonNull = types.filter((t) => !/^null$/i.test(t));
  if (literals.length && literals.length === nonNull.length) {
    prop.values = literals;
  } else if (prop.kind === 'string' || prop.kind === 'other') {
    prop.values = valuesFromDescription(prop.description);
  }
  // "Deprecated: use x", or an inline "@deprecated use x" anywhere in the description
  const dep = /^\s*deprecated\b:?\s*([\s\S]*)$/i.exec(prop.description) || /(?:^|\s)@deprecated\b:?\s*([\s\S]*)$/i.exec(prop.description);
  if (dep) prop.deprecated = dep[1].trim() || true;
  delete prop.documented;
}

/** The attribute spellings the engine treats as the same prop (`has-label`, `has_label`, `hasLabel`). */
export function camel(name: string): string {
  return name.replace(/[-_]+([A-Za-z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/** The attribute spelling the editor should insert, per `cast.propCase`. */
export function spell(name: string, style: 'camel' | 'kebab' | 'snake'): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_-]+/);
  if (style === 'kebab') return words.join('-');
  if (style === 'snake') return words.join('_');
  return camel(name);
}
