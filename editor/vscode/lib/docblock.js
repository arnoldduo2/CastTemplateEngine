"use strict";
/**
 * Reads what a component file says about itself: its docblocks and its `$prop ??= default` lines.
 * The PHP reader (src/Support/ComponentDocs.php) produces exactly the same JSON; the fixtures in
 * tests/fixtures/components are the contract between the two.
 *
 * Spec: {
 *   description: string,                      first free-text summary of a docblock
 *   props: [{ name, type, description, required, default, values, kind, deprecated, inferred }],
 *   slots: [{ name, description }],
 *   examples: string[],
 *   deprecated: false | string
 * }
 */

const PROP_TAGS = new Set(["var", "param", "prop", "property", "property-read", "property-write"]);

function parseComponent(source) {
  source = String(source).replace(/\r\n?/g, "\n");
  const blocks = docblocks(source);

  const spec = { description: "", props: [], slots: [], examples: [], deprecated: false };
  const byName = new Map();

  for (const block of blocks) {
    if (!spec.description && block.summary) spec.description = block.summary;

    for (const tag of block.tags) {
      if (PROP_TAGS.has(tag.name)) {
        const prop = propFromTag(tag, source, block.end);
        if (prop && !byName.has(prop.name)) {
          byName.set(prop.name, prop);
          spec.props.push(prop);
        }
      } else if (tag.name === "slot") {
        const m = /^(\S+)\s*([\s\S]*)$/.exec(tag.text);
        if (m && !spec.slots.some((s) => s.name === m[1])) spec.slots.push({ name: m[1], description: m[2].trim() });
      } else if (tag.name === "example") {
        if (tag.raw.trim()) spec.examples.push(tag.raw.trim());
      } else if (tag.name === "deprecated") {
        spec.deprecated = tag.text.trim() || true;
      }
    }
  }

  // defaults from the code: `$label ??= 'Button';`
  for (const { name, expression } of defaults(source)) {
    let prop = byName.get(name);
    if (!prop) {
      prop = newProp(name);
      prop.inferred = true;
      prop.kind = kindOf(null, expression);
      byName.set(name, prop);
      spec.props.push(prop);
    }
    prop.default = expression;
    prop.required = false;
  }

  for (const prop of spec.props) finish(prop);
  return spec;
}

function newProp(name) {
  return { name, type: null, description: "", required: false, default: null, values: [], kind: "other", deprecated: false, inferred: false };
}

function propFromTag(tag, source, blockEnd) {
  let text = tag.text.trim();
  let type = null;

  if (!text.startsWith("$")) {
    const read = readType(text);
    type = read.type;
    text = read.rest.trim();
  }
  let name;
  const named = /^\$([A-Za-z_][A-Za-z0-9_]*)\s*([\s\S]*)$/.exec(text);
  if (named) {
    name = named[1];
    text = named[2];
  } else {
    // an inline `/** @var string The label */` belongs to the variable assigned right after it
    const next = /^\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*(?:\?\?=|=)/.exec(source.slice(blockEnd));
    if (!next) return null;
    name = next[1];
  }
  const prop = newProp(name);
  prop.type = type;
  prop.description = text.replace(/^[-–—]\s*/, "").trim();
  prop.required = true; // until the type or a default says otherwise (see finish)
  prop.documented = true;
  return prop;
}

/** The type at the start of `text`: balanced <>, (), {}, quotes; unions may have spaces around | and &. */
function readType(text) {
  let i = 0;
  let depth = 0;
  let quote = null;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if ("<({[".includes(c)) {
      depth++;
    } else if (">)}]".includes(c)) {
      depth--;
    } else if (/\s/.test(c) && depth <= 0) {
      // a space ends the type unless a | or & joins the next part
      const rest = text.slice(i).trimStart();
      const before = text.slice(0, i).trimEnd();
      if (/^[|&]/.test(rest) || /[|&:]$/.test(before)) {   // a return type after `):` continues the type
        i++;
        continue;
      }
      break;
    }
    i++;
  }
  return { type: text.slice(0, i).trim() || null, rest: text.slice(i) };
}

/** Every `/** ... *​/` block with its cleaned-up summary and tags. */
function docblocks(source) {
  const out = [];
  const re = /\/\*\*([\s\S]*?)\*\//g;
  let m;
  while ((m = re.exec(source))) {
    const lines = m[1].split("\n").map((l) => l.replace(/^\s*\*? ?/, "").replace(/\s+$/, ""));
    const summary = [];
    const tags = [];
    let current = null;
    for (const line of lines) {
      const t = /^@([A-Za-z][A-Za-z0-9_-]*)\s?(.*)$/.exec(line);
      if (t) {
        current = { name: t[1].toLowerCase(), text: t[2], raw: t[2] };
        tags.push(current);
      } else if (current) {
        current.raw += "\n" + line;
        if (line.trim()) current.text += (current.text ? " " : "") + line.trim();
      } else {
        summary.push(line);
      }
    }
    out.push({ summary: summary.join("\n").trim().replace(/\n{2,}/g, "\n\n"), tags, end: m.index + m[0].length });
  }
  return out;
}

/** `$name ??= expression;` assignments, with the expression read up to its `;` (strings and brackets aware). */
function defaults(source) {
  const found = [];
  const re = /\$([A-Za-z_][A-Za-z0-9_]*)\s*\?\?=\s*/g;
  let m;
  while ((m = re.exec(source))) {
    const start = re.lastIndex;
    const end = expressionEnd(source, start);
    found.push({ name: m[1], expression: source.slice(start, end).trim().replace(/\s+/g, " ") });
    re.lastIndex = end;
  }
  return found;
}

function expressionEnd(src, i) {
  let depth = 0;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if ("([{".includes(c)) {
      depth++;
    } else if (")]}".includes(c)) {
      depth--;
    } else if (c === ";" && depth <= 0) {
      return i;
    } else if (c === "?" && src[i + 1] === ">" && depth <= 0) {
      return i;
    }
  }
  return i;
}

/** Fill in what follows from the type and the description: required, kind, allowed values, deprecation. */
function finish(prop) {
  const types = splitUnion(prop.type);
  const optionalType = types.some((t) => /^(null|mixed)$/i.test(t)) || (prop.type || "").startsWith("?");
  if (prop.documented) {
    prop.kind = kindOf(prop.type, prop.default);
    // a flag that is left out is simply false, so a bool is never required
    prop.required = !(optionalType || prop.default !== null || /\[optional\]/i.test(prop.description) || prop.kind === "bool");
  } else {
    prop.required = false;
    prop.kind = kindOf(prop.type, prop.default);
  }

  const literals = types.map(stripQuotes).filter((t) => t !== null);
  const nonNull = types.filter((t) => !/^null$/i.test(t));
  if (literals.length && literals.length === nonNull.length) {
    prop.values = literals;
  } else if (prop.kind === "string" || prop.kind === "other") {
    prop.values = valuesFromDescription(prop.description);
  }
  // "Deprecated: use x", or an inline "@deprecated use x" anywhere in the description
  const dep = /^\s*deprecated\b:?\s*([\s\S]*)$/i.exec(prop.description) || /(?:^|\s)@deprecated\b:?\s*([\s\S]*)$/i.exec(prop.description);
  if (dep) prop.deprecated = dep[1].trim() || true;
  delete prop.documented;
}

function splitUnion(type) {
  if (!type) return [];
  let t = type.trim();
  if (t.startsWith("?")) t = t.slice(1) + "|null";
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if ("<({[".includes(c)) depth++;
    else if (">)}]".includes(c)) depth--;
    else if (c === "|" && depth === 0) {
      parts.push(t.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(t.slice(start).trim());
  return parts.filter(Boolean);
}

function stripQuotes(t) {
  const m = /^(['"])(.*)\1$/.exec(t);
  return m ? m[2] : null;
}

function kindOf(type, defaultExpression) {
  const types = splitUnion(type).filter((t) => !/^null$/i.test(t));
  if (types.length) {
    if (types.every((t) => /^(bool|boolean|true|false)$/i.test(t))) return "bool";
    if (types.every((t) => /^(int|integer|float|double|numeric|positive-int|negative-int|int<.*>)$/i.test(t))) return "number";
    if (types.every((t) => /^(string|non-empty-string|class-string|numeric-string)$/i.test(t) || stripQuotes(t) !== null)) return "string";
    return "other";
  }
  // no type: guess from the default
  const d = (defaultExpression || "").trim();
  if (/^(true|false)$/i.test(d)) return "bool";
  if (/^-?\d+(\.\d+)?$/.test(d)) return "number";
  if (/^(['"]).*\1$/.test(d)) return "string";
  return "other";
}

/** Quoted or backticked words after "e.g.", "one of", "such as", "values:" or inside the first parentheses. */
function valuesFromDescription(description) {
  if (!description) return [];
  let region = null;
  const lead = /(?:\be\.g\.?,?|\bone of|\bsuch as|\bvalues?:|\boptions?:|\bpossible values?:)\s*([\s\S]*)$/i.exec(description);
  if (lead) region = lead[1];
  else {
    const paren = /\(([^)]*)\)/.exec(description);
    if (paren) region = paren[1];
  }
  if (!region) return [];
  const values = [];
  const re = /"([^"]+)"|'([^']+)'|`([^`]+)`/g;
  let m;
  while ((m = re.exec(region))) {
    const v = m[1] ?? m[2] ?? m[3];
    if (!values.includes(v)) values.push(v);
  }
  return values.length <= 20 ? values : [];
}

/** The attribute spellings the engine treats as the same prop (`has-label`, `has_label`, `hasLabel`). */
function camel(name) {
  return name.replace(/[-_]+([A-Za-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());
}

module.exports = { parseComponent, camel, splitUnion, readType };
