"use strict";
/**
 * Finds the things in a .cast.php source that point to other files, the same way the engine's compiler reads it
 * (CastTemplateEngine\Compiler): component tags in HTML, and inside `{ ... }` attribute values, but never inside
 * `<?php ?>`, `<!-- -->`, `<script>`, `<style>` or quoted attribute values.
 *
 * Pure functions on a string, no VS Code API: offsets are returned (start inclusive, end exclusive).
 */

const NAME = "[A-Z][A-Za-z0-9_]*(?:\\.[A-Z][A-Za-z0-9_]*)*";
const COMPONENT_OPEN = new RegExp(`<(\\/?)(${NAME})(?=[\\s/>])`, "y");
const RAW_ELEMENT = /<(script|style)\b/iy;

/**
 * @typedef {{kind: 'component', name: string, start: number, end: number, closing: boolean}} ComponentRef
 * @param {string} src
 * @returns {ComponentRef[]}
 */
function scanComponents(src) {
  const found = [];
  let pos = 0;

  while (pos < src.length) {
    const lt = src.indexOf("<", pos);
    if (lt < 0) break;
    pos = lt;

    if (src.startsWith("<?", pos)) {
      const end = src.indexOf("?>", pos + 2);
      pos = end < 0 ? src.length : end + 2;
      continue;
    }
    if (src.startsWith("<!--", pos)) {
      const end = src.indexOf("-->", pos + 4);
      pos = end < 0 ? src.length : end + 3;
      continue;
    }
    RAW_ELEMENT.lastIndex = pos;
    const raw = RAW_ELEMENT.exec(src);
    if (raw) {
      // the content of <script> and <style> is not template syntax: skip to (and over the `</` of) the closing tag
      const close = src.toLowerCase().indexOf(`</${raw[1].toLowerCase()}`, pos);
      if (close < 0) break;
      pos = close + 2;
      continue;
    }

    COMPONENT_OPEN.lastIndex = pos;
    const tag = COMPONENT_OPEN.exec(src);
    if (tag) {
      const closing = tag[1] === "/";
      const start = pos + 1 + tag[1].length;
      const ref = { kind: "component", name: tag[2], start, end: start + tag[2].length, closing, tagStart: pos, tagEnd: null, selfClosing: false, attrs: [] };
      found.push(ref);
      pos += tag[0].length;
      if (closing) {
        pos = skipTo(src, pos, ">");
        ref.tagEnd = src[pos - 1] === ">" ? pos : null;
      } else {
        pos = attributes(src, pos, found, ref);
      }
      continue;
    }

    if (/^<[A-Za-z]/.test(src.slice(pos, pos + 2))) {
      pos = attributes(src, pos + 1, found);   // a plain HTML tag: attribute values may hold { <Component /> }
      continue;
    }
    pos++;
  }
  return found;
}

function skipTo(src, pos, char) {
  const i = src.indexOf(char, pos);
  return i < 0 ? src.length : i + 1;
}

const ATTRIBUTE_NAME = /[A-Za-z_:@][-A-Za-z0-9_:.@]*/y;

/**
 * Walks the attributes of a tag up to and including its `>`; components inside `{ }` values are collected.
 * When `ref` is given (a component tag), its attributes are recorded on it: {name, nameStart, nameEnd, equals, valueType, valueStart, valueEnd}.
 * `valueType` is 'string' (inside the quotes), 'brace' (inside the braces) or 'spread' (`{...$x}`); `valueEnd` is null when unterminated.
 */
function attributes(src, pos, found, ref = null) {
  while (pos < src.length) {
    const c = src[pos];
    if (c === ">") {
      if (ref) {
        ref.tagEnd = pos + 1;
        ref.selfClosing = src[pos - 1] === "/";
      }
      return pos + 1;
    }

    if (ref && /[A-Za-z_:@]/.test(c)) {
      ATTRIBUTE_NAME.lastIndex = pos;
      const m = ATTRIBUTE_NAME.exec(src);
      const attr = { name: m[0], nameStart: pos, nameEnd: pos + m[0].length, equals: null, valueType: null, valueStart: null, valueEnd: null };
      ref.attrs.push(attr);
      pos = attr.nameEnd;

      let look = pos;
      while (look < src.length && /\s/.test(src[look])) look++;
      if (src[look] === "=") {
        attr.equals = look;
        pos = look + 1;
        while (pos < src.length && /\s/.test(src[pos])) pos++;
        const q = src[pos];
        if (q === '"' || q === "'") {
          attr.valueType = "string";
          attr.valueStart = pos + 1;
          const end = quoted(src, pos, q);
          attr.valueEnd = src[end - 1] === q && end - 1 >= attr.valueStart ? end - 1 : null;
          pos = end;
        } else if (q === "{") {
          attr.valueType = "brace";
          attr.valueStart = pos + 1;
          const end = braces(src, pos + 1, found);
          attr.valueEnd = src[end - 1] === "}" && end - 1 >= attr.valueStart ? end - 1 : null;
          pos = end;
        }
      }
      continue;
    }

    if (c === '"' || c === "'") {
      pos = quoted(src, pos, c);
    } else if (c === "{") {
      const start = pos;
      pos = braces(src, pos + 1, found);
      if (ref && /^\{\s*\.\.\./.test(src.slice(start, start + 12))) {
        ref.attrs.push({ name: null, nameStart: start, nameEnd: start, equals: null, valueType: "spread", valueStart: start + 1, valueEnd: src[pos - 1] === "}" ? pos - 1 : null });
      }
    } else if (src.startsWith("<?", pos)) {
      const end = src.indexOf("?>", pos + 2);
      pos = end < 0 ? src.length : end + 2;
    } else {
      pos++;
    }
  }
  return pos;
}

/** A quoted attribute value (may contain `<?= ... ?>`); returns the position after the closing quote. */
function quoted(src, pos, quote) {
  pos++;
  while (pos < src.length) {
    if (src.startsWith("<?", pos)) {
      const end = src.indexOf("?>", pos + 2);
      pos = end < 0 ? src.length : end + 2;
      continue;
    }
    if (src[pos] === "\\") {
      pos += 2;
      continue;
    }
    if (src[pos] === quote) return pos + 1;
    pos++;
  }
  return pos;
}

/** The inside of `{ ... }` (nested braces and PHP strings aware); returns the position after the closing brace. */
function braces(src, pos, found) {
  let depth = 1;
  while (pos < src.length) {
    const c = src[pos];
    if (c === '"' || c === "'") {
      pos = phpString(src, pos, c);
      continue;
    }
    if (c === "{") {
      depth++;
    } else if (c === "}") {
      if (--depth === 0) return pos + 1;
    } else if (c === "<") {
      COMPONENT_OPEN.lastIndex = pos;
      const tag = COMPONENT_OPEN.exec(src);
      if (tag && tag[1] === "") {
        const start = pos + 1;
        const ref = { kind: "component", name: tag[2], start, end: start + tag[2].length, closing: false, tagStart: pos, tagEnd: null, selfClosing: false, attrs: [] };
        found.push(ref);
        pos = attributes(src, pos + tag[0].length, found, ref);
        continue;
      }
    }
    pos++;
  }
  return pos;
}

function phpString(src, pos, quote) {
  pos++;
  while (pos < src.length) {
    if (src[pos] === "\\") {
      pos += 2;
      continue;
    }
    if (src[pos] === quote) return pos + 1;
    pos++;
  }
  return pos;
}

const PATH = "[A-Za-z0-9_][A-Za-z0-9_./\\-]*";
const HELPERS = [
  // views and partials: __includes('layouts.header'), views('home.home'), $this->view('items.items'), partial('x.y')
  { kind: "view", re: new RegExp(`(?:\\b__includes|\\bviews|(?:->|::)view|(?:->|::)partial|\\brender)\\s*\\(\\s*(['"])(${PATH})\\1`, "g") },
  // legacy components: Component('btns.add-new', [...])
  { kind: "legacy-component", re: new RegExp(`\\bComponent\\s*\\(\\s*(['"])(${PATH})\\1`, "g") },
  // css/js modules: __modules('app.app', 'js'), __modules('items.items', 'css')
  { kind: "module", re: new RegExp(`\\b__modules\\s*\\(\\s*(['"])(${PATH})\\1(?:\\s*,\\s*(['"])(js|css)\\3)?`, "g") },
];

/**
 * References in PHP helper calls: the name inside the quotes.
 * @typedef {{kind: 'view'|'legacy-component'|'module', name: string, start: number, end: number, type?: 'js'|'css'}} HelperRef
 * @param {string} src
 * @returns {HelperRef[]}
 */
function scanHelpers(src) {
  const found = [];
  for (const { kind, re } of HELPERS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const name = m[2];
      const start = m.index + m[0].indexOf(m[1] + name) + 1;
      const ref = { kind, name, start, end: start + name.length };
      if (kind === "module") ref.type = m[4] === "css" ? "css" : "js";
      found.push(ref);
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

const CHAIN_START = /@(\$?[A-Za-z_][A-Za-z0-9_]*)\s*\.\s*(filter|map)\b/y;
const CHAIN_NEXT = /\s*\.\s*(filter|map)\b/y;

/**
 * Finds `.filter`/`.map` segments of a fluent collection chain: `@$items.filter(...).map(...)` (the `$` is optional).
 * Only the method name is returned as a range (not the leading dot or the parentheses), same convention as
 * `scanComponents`' tag-name ranges. Skips `<?php ?>`, comments, `<script>` and `<style>`, same as component scanning,
 * since the chain is only ever recognized in the template's HTML/markup region (CastTemplateEngine\Directives::handleChain).
 *
 * @typedef {{kind: 'chain', method: 'filter'|'map', start: number, end: number}} ChainRef
 * @param {string} src
 * @returns {ChainRef[]}
 */
function scanChainCalls(src) {
  const found = [];
  let pos = 0;

  while (pos < src.length) {
    const ltIdx = src.indexOf("<", pos);
    const atIdx = src.indexOf("@", pos);
    if (atIdx < 0) break;

    if (ltIdx >= 0 && ltIdx < atIdx) {
      if (src.startsWith("<?", ltIdx)) {
        const end = src.indexOf("?>", ltIdx + 2);
        pos = end < 0 ? src.length : end + 2;
        continue;
      }
      if (src.startsWith("<!--", ltIdx)) {
        const end = src.indexOf("-->", ltIdx + 4);
        pos = end < 0 ? src.length : end + 3;
        continue;
      }
      RAW_ELEMENT.lastIndex = ltIdx;
      const raw = RAW_ELEMENT.exec(src);
      if (raw) {
        const close = src.toLowerCase().indexOf(`</${raw[1].toLowerCase()}`, ltIdx);
        pos = close < 0 ? src.length : close + 2;
        continue;
      }
      pos = ltIdx + 1;
      continue;
    }

    CHAIN_START.lastIndex = atIdx;
    const m = CHAIN_START.exec(src);
    if (m && m.index === atIdx) {
      const firstMethod = m[2];
      const firstStart = atIdx + m[0].length - firstMethod.length;
      found.push({ kind: "chain", method: firstMethod, start: firstStart, end: firstStart + firstMethod.length });

      let p = skipParens(src, atIdx + m[0].length);
      for (;;) {
        CHAIN_NEXT.lastIndex = p;
        const n = CHAIN_NEXT.exec(src);
        if (!(n && n.index === p)) break;
        const method = n[1];
        const start = p + n[0].length - method.length;
        found.push({ kind: "chain", method, start, end: start + method.length });
        p = skipParens(src, p + n[0].length);
      }
      pos = p;
      continue;
    }
    pos = atIdx + 1;
  }

  return found;
}

/** The position just after the balanced `( ... )` starting at (or after whitespace from) `pos`; `pos` itself if there is none. */
function skipParens(src, pos) {
  let i = pos;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== "(") return pos;

  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i = phpString(src, i, c) - 1;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return src.length;
}

module.exports = { scanComponents, scanHelpers, scanChainCalls, NAME };
