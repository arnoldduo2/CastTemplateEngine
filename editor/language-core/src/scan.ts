/**
 * References in PHP helper calls (`view()`/legacy `Component()`/module helpers) and fluent `.filter()/.map()`
 * collection chains. Pure text scans, ported from editor/vscode/lib/scan.js so the LSP can share them; this module
 * does not port `scanComponents` - the LSP already has its own component-tag detection via `CastParser`, and the
 * extension's copy of `scanComponents` stays extension-only (no shared consumer needs it).
 */

const RAW_ELEMENT = /<(script|style)\b/iy;

export type HelperKind = 'view' | 'legacy-component' | 'module';

export interface HelperRef {
  kind: HelperKind;
  name: string;
  start: number;
  end: number;
  type?: 'css' | 'js';
}

const PATH = "[A-Za-z0-9_][A-Za-z0-9_./\\-]*";
const HELPERS: { kind: HelperKind; re: RegExp }[] = [
  // views and partials: __includes('layouts.header'), views('home.home'), $this->view('items.items'), partial('x.y')
  { kind: 'view', re: new RegExp(`(?:\\b__includes|\\bviews|(?:->|::)view|(?:->|::)partial|\\brender)\\s*\\(\\s*(['"])(${PATH})\\1`, 'g') },
  // legacy components: Component('btns.add-new', [...])
  { kind: 'legacy-component', re: new RegExp(`\\bComponent\\s*\\(\\s*(['"])(${PATH})\\1`, 'g') },
  // css/js modules: __modules('app.app', 'js'), __modules('items.items', 'css')
  { kind: 'module', re: new RegExp(`\\b__modules\\s*\\(\\s*(['"])(${PATH})\\1(?:\\s*,\\s*(['"])(js|css)\\3)?`, 'g') },
];

/** References in PHP helper calls: the name inside the quotes. */
export function scanHelpers(src: string): HelperRef[] {
  const found: HelperRef[] = [];
  for (const { kind, re } of HELPERS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const name = m[2];
      const start = m.index + m[0].indexOf(m[1] + name) + 1;
      const ref: HelperRef = { kind, name, start, end: start + name.length };
      if (kind === 'module') ref.type = m[4] === 'css' ? 'css' : 'js';
      found.push(ref);
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

export interface ChainRef {
  kind: 'chain';
  method: 'filter' | 'map';
  start: number;
  end: number;
}

const CHAIN_START = /@(\$?[A-Za-z_][A-Za-z0-9_]*)\s*\.\s*(filter|map)\b/y;
const CHAIN_NEXT = /\s*\.\s*(filter|map)\b/y;

/**
 * Finds `.filter`/`.map` segments of a fluent collection chain: `@$items.filter(...).map(...)` (the `$` is optional).
 * Only the method name is returned as a range (not the leading dot or the parentheses), same convention as
 * `scanComponents`' tag-name ranges. Skips `<?php ?>`, comments, `<script>` and `<style>`, same as component scanning,
 * since the chain is only ever recognized in the template's HTML/markup region (CastTemplateEngine\Directives::handleChain).
 */
export function scanChainCalls(src: string): ChainRef[] {
  const found: ChainRef[] = [];
  let pos = 0;

  while (pos < src.length) {
    const ltIdx = src.indexOf('<', pos);
    const atIdx = src.indexOf('@', pos);
    if (atIdx < 0) break;

    if (ltIdx >= 0 && ltIdx < atIdx) {
      if (src.startsWith('<?', ltIdx)) {
        const end = src.indexOf('?>', ltIdx + 2);
        pos = end < 0 ? src.length : end + 2;
        continue;
      }
      if (src.startsWith('<!--', ltIdx)) {
        const end = src.indexOf('-->', ltIdx + 4);
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
      const firstMethod = m[2] as 'filter' | 'map';
      const firstStart = atIdx + m[0].length - firstMethod.length;
      found.push({ kind: 'chain', method: firstMethod, start: firstStart, end: firstStart + firstMethod.length });

      let p = skipParens(src, atIdx + m[0].length);
      for (;;) {
        CHAIN_NEXT.lastIndex = p;
        const n = CHAIN_NEXT.exec(src);
        if (!(n && n.index === p)) break;
        const method = n[1] as 'filter' | 'map';
        const start = p + n[0].length - method.length;
        found.push({ kind: 'chain', method, start, end: start + method.length });
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
function skipParens(src: string, pos: number): number {
  let i = pos;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '(') return pos;

  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i = phpString(src, i, c) - 1;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
  }
  return src.length;
}

/** The position just after a PHP string literal starting at `pos` (the index of the opening quote). */
function phpString(src: string, pos: number, quote: string): number {
  pos++;
  while (pos < src.length) {
    if (src[pos] === '\\') {
      pos += 2;
      continue;
    }
    if (src[pos] === quote) return pos + 1;
    pos++;
  }
  return pos;
}
