"use strict";
/**
 * The editor side of `@props{ ... }` (see CastTemplateEngine\Props, the PHP compiler's own reader - this file and
 * that class recognize exactly the same grammar, the same way docblock.js and ComponentDocs.php already do for the
 * legacy `??=`/docblock convention). parsePropsBlock() produces props in the *same* shape parseComponent() already
 * does ({name, type, description, required, default, values, kind, deprecated, inferred}), reusing docblock.js's
 * own readType()/finish() rather than re-deriving kind/values/deprecated separately - so every existing consumer
 * (components.js, complete.js, every relevant class in extension.js) needs no changes at all; only
 * parseComponent() itself gains a third merge pass from this file's output.
 */
const { readType, finish, newProp } = require("./docblock");

/** Matches `@props{` or `@props extends::Dotted.Path{`; group 1 is the dotted path, when present - mirrors CastTemplateEngine\Props::BLOCK_START exactly. */
const BLOCK_START = /@props\b(?:\s+extends::([A-Za-z_][\w.]*))?\s*\{/;

/** @returns {{props: object[], extends: string|null, start: number|null, end: number|null, markupBefore: number|null}} */
function parsePropsBlock(source) {
  const none = { props: [], extends: null, start: null, end: null, markupBefore: null };
  const m = BLOCK_START.exec(source);
  if (!m) return none;
  const at = m.index;
  const extends_ = m[1] ?? null;
  const openBrace = at + m[0].length - 1;

  const markup = firstMarkupOffset(source);
  const markupBefore = markup !== null && markup < at ? markup : null;

  const close = closingBrace(source, openBrace);
  if (close === null) return { props: [], extends: extends_, start: at, end: null, markupBefore };

  const bodyStart = openBrace + 1;
  const body = source.slice(bodyStart, close);
  const props = parseEntries(body);

  let end = close + 1;
  const semi = /^\s*;/.exec(source.slice(end));
  if (semi) end += semi[0].length;

  return { props, extends: extends_, start: at, end, markupBefore };
}

/** Position just after the balanced `{ ... }` starting at `open` (the index of the `{`), quote-aware; null if never closed. */
function closingBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return null;
}

/**
 * The offset of the first real HTML/component tag in `source`: skips `<?php ?>`/`<?= ?>` blocks and quoted
 * strings, since a `<` inside either is never markup. A directive (`@foreach`, `@if`, ...) is not markup either and
 * never starts with `<`, so it needs no special handling. A light text scan, not a full tokenizer - mirrors
 * CastTemplateEngine\Props::firstMarkupOffset() exactly.
 */
function firstMarkupOffset(source) {
  const n = source.length;
  for (let i = 0; i < n; i++) {
    const c = source[i];
    if (c === '"' || c === "'") {
      for (i++; i < n && source[i] !== c; i++) if (source[i] === "\\") i++;
      continue;
    }
    if (c === "<" && source[i + 1] === "?") {
      const end = source.indexOf("?>", i + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === "<" && /^<[A-Za-z!/]/.test(source.slice(i))) return i;
  }
  return null;
}

function parseEntries(body) {
  const props = [];
  const seen = new Set();
  for (const { text, offset } of splitEntries(body)) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    const read = readType(trimmed);
    if (!read.type) continue; // malformed entry: skip rather than throw (the PHP compiler is the source of truth for errors)
    const rest = (read.rest || "").trim();

    const named = /^\$([A-Za-z_][A-Za-z0-9_]*)\s*([\s\S]*)$/.exec(rest);
    if (!named) continue;
    const name = named[1];
    if (seen.has(name)) continue;
    seen.add(name);

    const after = (named[2] || "").trim();
    let defaultExpr = null;
    if (after !== "" && after[0] === "=") {
      defaultExpr = after.slice(1).trim() || null;
    }

    // unlike CastTemplateEngine\Props::scan(), an unsupported type name is not rejected here: the editor's role is
    // informational (hover/completion), not enforcement - that is the compiler's job, and matches the existing,
    // equally lenient treatment of a docblock's own @var/@param type text, which is never validated against a list
    const prop = newProp(name);
    prop.type = read.type;
    prop.default = defaultExpr;
    prop.required = defaultExpr === null;
    prop.documented = true; // run through finish()'s "documented" branch for kind/values/deprecated, then required is restored below
    finish(prop);
    prop.required = defaultExpr === null; // @props{}'s own rule (no default = required) is explicit, not inferred - finish()'s own heuristic (e.g. "a bool is never required") does not apply here
    props.push(prop);
  }
  return props;
}

/**
 * Splits the interior of @props{} into top-level, semicolon-terminated entries (PHP-statement style): comment-aware
 * (a `//`/`/ *...* /` is stripped, not mistaken for content), quote-aware, and bracket-depth-aware (a `;` inside a
 * default's own closure body is not a separator) - mirrors CastTemplateEngine\Props::splitEntries() exactly.
 */
function splitEntries(body) {
  const entries = [];
  const n = body.length;
  let depth = 0;
  let quote = null;
  let clean = "";
  let entryStart = null;

  for (let i = 0; i < n; i++) {
    const c = body[i];
    if (quote) {
      clean += c;
      if (c === "\\" && i + 1 < n) {
        i++;
        clean += body[i];
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      if (entryStart === null) entryStart = i;
      quote = c;
      clean += c;
      continue;
    }
    if (c === "/" && body[i + 1] === "/") {
      const end = body.indexOf("\n", i);
      i = end === -1 ? n : end;
      if (end !== -1) clean += "\n";
      continue;
    }
    if (c === "/" && body[i + 1] === "*") {
      const end = body.indexOf("*/", i + 2);
      const segment = end === -1 ? body.slice(i) : body.slice(i, end + 2);
      clean += "\n".repeat((segment.match(/\n/g) || []).length);
      i = end === -1 ? n - 1 : end + 1;
      continue;
    }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    if (c === ";" && depth <= 0) {
      if (clean.trim()) entries.push({ text: clean, offset: entryStart ?? i });
      clean = "";
      entryStart = null;
      continue;
    }
    if (entryStart === null && !/\s/.test(c)) entryStart = i;
    clean += c;
  }
  if (clean.trim()) entries.push({ text: clean, offset: entryStart ?? n });

  return entries;
}

module.exports = { parsePropsBlock, firstMarkupOffset };
