"use strict";
/**
 * Finds `@{ ... }` echo holes and `@css(`/`@script(`/`@js(` embedded bodies in a .cast.php source, so the extension can
 * bridge hover/completion for them to VS Code's built-in PHP/CSS/JS language providers via virtual documents.
 *
 * Pure functions on a string, no vscode API. Mirrors CastTemplateEngine\Directives::run(): `@{ }` is inactive only
 * inside `<? ... ?>` (real PHP takes precedence there); everywhere else - including inside literal <script>/<style>
 * tags and HTML comments - it is live, same as the compiler.
 */

/** Position just after the balanced `{ ... }` starting at `open` (the index of the `{`); PHP-string aware. Returns -1 when never closed. */
function closingBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

/** Position just after the balanced `( ... )` starting at `open` (the index of the `(`); string/comment aware. Returns -1 when never closed. */
function closingParen(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * @typedef {{start: number, end: number, exprStart: number, exprEnd: number}} EchoHole  start/end include the `@{`/`}`
 * @param {string} src
 * @returns {EchoHole[]}
 */
function findEchoHoles(src) {
  const found = [];
  let pos = 0;
  while (pos < src.length) {
    const lt = src.indexOf("<?", pos);
    const at = src.indexOf("@{", pos);
    if (at < 0) break;

    if (lt >= 0 && lt < at) {
      const end = src.indexOf("?>", lt + 2);
      pos = end < 0 ? src.length : end + 2;
      continue;
    }

    const end = closingBrace(src, at + 1);
    if (end < 0) break; // unclosed: nothing more to reliably find
    found.push({ start: at, end, exprStart: at + 2, exprEnd: end - 1 });
    pos = end;
  }
  return found;
}

/**
 * @typedef {{start: number, end: number, exprStart: number, exprEnd: number}} BraceExpr  start/end include the `{`/`}`, not the `=`
 * @param {string} src
 * @returns {BraceExpr[]}
 */
function findBraceExpressions(src) {
  const found = [];
  let pos = 0;
  while (pos < src.length) {
    const lt = src.indexOf("<?", pos);
    const eq = src.indexOf("=", pos);
    if (eq < 0) break;

    if (lt >= 0 && lt < eq) {
      const end = src.indexOf("?>", lt + 2);
      pos = end < 0 ? src.length : end + 2;
      continue;
    }
    if (src[eq + 1] !== "{") {
      pos = eq + 1;
      continue;
    }
    const open = eq + 1;
    const end = closingBrace(src, open);
    if (end < 0) break;
    found.push({ start: open, end, exprStart: open + 1, exprEnd: end - 1 });
    pos = end;
  }
  return found;
}

/**
 * Directive words whose `(...)` argument is forwarded for PHP hover/completion bridging - matches
 * CastTemplateEngine\Directives::WORD plus FUNCTION_DIRECTIVES (vendor/anode/cast-template-engine/src/Directives.php).
 * `@css`/`@script`/`@js` are handled separately by findEmbeddedBlocks() (their body is CSS/JS, not PHP); directives
 * that take no parenthesized argument (`@else`, `@endphp`, `@scripts`, `@styles`, ...) are excluded.
 */
const DIRECTIVE_ARG_WORD = "(for|foreach|forelse|while|if|elseif|unless|isset|switch|case|php|map|filter|break|continue|htchars|route|cast|csrf|alerts|modules)";
const DIRECTIVE_OPEN = new RegExp(`@${DIRECTIVE_ARG_WORD}\\s*\\(`, "g");
const MARKUP_RENDER = /\breturn\s*\(|@render\s*\(/;

/**
 * Framework-helper directive name -> the real PHP function it compiles to - matches
 * CastTemplateEngine\Directives::FUNCTION_DIRECTIVES (vendor/anode/cast-template-engine/src/Directives.php) exactly.
 * Used to bridge hovering the *directive word itself* (not its arguments, which findDirectiveArguments already
 * covers) to that real function's own hover - its actual docblock, via the built-in PHP language service - instead
 * of a hardcoded description that has to be kept in sync by hand whenever the real function's doc changes.
 */
const FUNCTION_DIRECTIVES = {
  htchars: "htchars",
  route: "route",
  cast: "__cast",
  csrf: "__csrf",
  alerts: "__getAlerts",
  modules: "__modules",
};

/**
 * @typedef {{start: number, end: number, exprStart: number, exprEnd: number, word: string}} DirectiveArgs  start/end include `@word(`/`)`
 * @param {string} src
 * @returns {DirectiveArgs[]}
 */
function findDirectiveArguments(src) {
  const found = [];
  let pos = 0;
  while (pos < src.length) {
    const lt = src.indexOf("<?", pos);
    DIRECTIVE_OPEN.lastIndex = pos;
    const m = DIRECTIVE_OPEN.exec(src);
    if (!m) break;

    if (lt >= 0 && lt < m.index) {
      const end = src.indexOf("?>", lt + 2);
      pos = end < 0 ? src.length : end + 2;
      continue;
    }

    const open = m.index + m[0].length - 1;
    const end = closingParen(src, open);
    if (end < 0) {
      pos = open + 1;
      continue;
    }
    let exprEnd = end - 1;
    if (m[1] === "map" || m[1] === "filter") {
      // every other directive's (...) is pure PHP, but @map/@filter's callback often ends in
      // `=> return(<markup/>)` or `=> @render(<markup/>)` - markup, not PHP. Feeding that to intelephense as PHP
      // is invalid syntax and can break hover for the whole span, including the genuinely-PHP part before it
      // (the collection expression, the arrow params, or - for @filter's 2-arg standalone form - the predicate
      // itself). Bridge only up to the markup, never past it.
      const markup = MARKUP_RENDER.exec(src.slice(open + 1, exprEnd));
      if (markup) exprEnd = open + 1 + markup.index;
    }
    found.push({ start: m.index, end, exprStart: open + 1, exprEnd, word: m[1] });
    pos = end;
  }
  return found;
}

/** A loop directive word -> the `@end...` word that closes it (control-flow directives without their own `@end`, like @if, never declare a variable, so are not listed here). */
const LOOP_END = { foreach: "endforeach", forelse: "endforelse", for: "endfor", while: "endwhile" };

/** A @map/@filter callback's own `($item, $i) =>` (no markup after it: already truncated by findDirectiveArguments). */
const CALLBACK_PARAMS = /\(([^()]*)\)\s*=>\s*$/;

/**
 * Every directive that introduces new PHP variables visible later in the same file, and the region they are visible
 * in - so a span bridged elsewhere (an echo hole, a brace expression, another directive's own arguments) can also
 * expose the declaration(s) its variables actually come from, instead of resolving against nothing (see
 * extension.js's `openPhpVirtual`/`openCallVirtual`, which build a virtual document that includes a scope's own
 * `text(src)` ahead of the span being bridged). Two shapes:
 * - `@foreach`/`@forelse`/`@for`/`@while`: `{kind: "verbatim", start, end}` - the loop's own real keyword + arguments
 *   (its `@` excluded, so it reads as real PHP control flow, e.g. `foreach ($items as $item)`, not `@foreach (...)`,
 *   which is not valid PHP - `@` only prefixes an expression, never a keyword), visible from the loop's own closing
 *   `)` up to the matching `@end<word>` (depth-aware: the same loop word can nest inside itself). PHP has no block
 *   scoping for a `foreach`'s loop variable - it stays defined for the rest of the enclosing script after the loop,
 *   which is exactly the "declared once, usable later" shape a bridged virtual document needs, and real source text
 *   can be reused completely as-is.
 * - `@map`/`@filter`: `{kind: "synthetic", text}` - a *constructed* `foreach ($collection as $key => $value)` (or
 *   `as $value` for a 1-parameter callback) standing in for the callback's own `($item, $i) => `. This can't reuse
 *   real source text the way a loop can: the callback is only valid PHP with an `fn`/`function` keyword this DSL
 *   omits, and even with one added, an arrow function's own parameters are scoped *only* to its own body expression
 *   - they do not leak into later, separately-bridged code the way a `foreach` variable does. A `foreach` is both
 *   valid, complete PHP on its own *and* has the same leaking scope the callback conceptually has, which a real
 *   arrow/closure function never would - so it is substituted in, not the real syntax. Only 1- and 2-parameter
 *   callbacks are recognised (matching this engine's own documented callback shapes); anything else is skipped
 *   rather than guessed at.
 * `at` (every shape) is the real offset of the directive's own `@word` - a fallback jump target for a "synthetic"
 * scope's declaration, which (being constructed, not sliced from one real place) has no real range of its own to
 * point a go-to-definition result at; see extension.js's `openTranslated`.
 * @typedef {({kind: "verbatim", start: number, end: number} | {kind: "synthetic", text: string}) & {at: number, bodyStart: number, bodyEnd: number}} Scope
 * @param {string} src
 * @returns {Scope[]}
 */
function findScopes(src) {
  const scopes = [];
  for (const d of findDirectiveArguments(src)) {
    if (d.word === "map" || d.word === "filter") {
      const declText = src.slice(d.exprStart, d.exprEnd);
      const m = CALLBACK_PARAMS.exec(declText);
      if (!m) continue;
      const collection = declText.slice(0, m.index).replace(/,\s*$/, "").trim();
      const params = m[1].split(",").map((p) => p.trim()).filter(Boolean);
      let text = null;
      if (params.length === 1) text = `foreach (${collection} as ${params[0]})`;
      else if (params.length === 2) text = `foreach (${collection} as ${params[1]} => ${params[0]})`;
      if (text) scopes.push({ kind: "synthetic", text, at: d.start, bodyStart: d.exprEnd, bodyEnd: d.end });
    } else if (LOOP_END[d.word]) {
      const endWord = LOOP_END[d.word];
      const re = new RegExp(`@(${d.word}|${endWord})\\b`, "g");
      re.lastIndex = d.end;
      let depth = 1;
      let bodyEnd = src.length;
      let m;
      while ((m = re.exec(src))) {
        if (m[1] === d.word) depth++;
        else if (--depth === 0) {
          bodyEnd = m.index;
          break;
        }
      }
      scopes.push({ kind: "verbatim", start: d.start + 1, end: d.end, at: d.start, bodyStart: d.end, bodyEnd });
    }
  }
  return scopes;
}

/** The scopes (see findScopes) whose body actually encloses `offset` - every variable-declaring span in scope there, outermost first. */
function scopesAt(src, offset) {
  return findScopes(src).filter((s) => offset > s.bodyStart && offset < s.bodyEnd);
}

/** A scope's own declaration text - real source for a "verbatim" scope, a constructed stand-in for a "synthetic" one. */
function scopeText(src, scope) {
  return scope.kind === "verbatim" ? src.slice(scope.start, scope.end) : scope.text;
}

const BLOCK_OPEN = /@(css|script|js)\s*\(/g;

/**
 * @typedef {{kind: 'css'|'script'|'js', start: number, end: number, bodyStart: number, bodyEnd: number, holes: EchoHole[]}} EmbeddedBlock
 * @param {string} src
 * @returns {EmbeddedBlock[]}
 */
function findEmbeddedBlocks(src) {
  const found = [];
  BLOCK_OPEN.lastIndex = 0;
  let m;
  while ((m = BLOCK_OPEN.exec(src))) {
    const open = m.index + m[0].length - 1; // the "(" itself
    const end = closingParen(src, open);
    if (end < 0) {
      BLOCK_OPEN.lastIndex = open + 1;
      continue;
    }
    const bodyStart = open + 1;
    const bodyEnd = end - 1;
    found.push({
      kind: m[1],
      start: m.index,
      end,
      bodyStart,
      bodyEnd,
      holes: findEchoHoles(src.slice(bodyStart, bodyEnd)).map((h) => ({
        start: h.start + bodyStart,
        end: h.end + bodyStart,
        exprStart: h.exprStart + bodyStart,
        exprEnd: h.exprEnd + bodyStart,
      })),
    });
    BLOCK_OPEN.lastIndex = end;
  }
  return found;
}

/** Every character of `text` becomes a space except newlines, which are kept verbatim (so line/column numbers never need translation). */
function maskAll(text) {
  return text.replace(/[^\n]/g, " ");
}

/**
 * A throwaway PHP document: only the inner expression of one `@{ }` hole is left intact, everything else is masked.
 * Only the first 5 characters of the document (never inside a real hole: a .cast.php file always starts with `<?php`
 * or `<!DOCTYPE`) become the literal `<?php` opening tag, so every other character - including every newline - stays
 * at its original offset and the hovered position never needs translating. Used only when the span has no enclosing
 * scope (see findScopes/scopesAt) to expose - when it does, buildScopedVirtual is used instead, since a scope's own
 * declaration (verbatim real text, or constructed stand-in text for @map/@filter - see findScopes) has to be placed
 * *before* the span, which position-preserving masking has no room for without shifting everything after it.
 */
function buildPhpVirtual(realText, exprStart, exprEnd) {
  const masked = maskAll(realText);
  const withHole = masked.slice(0, exprStart) + realText.slice(exprStart, exprEnd) + masked.slice(exprEnd);
  return "<?php" + withHole.slice(5);
}

/** A throwaway CSS or JS document: only one embedded block's body is left intact (its own nested `@{ }` holes masked too). */
function buildBlockVirtual(realText, block) {
  let masked = maskAll(realText);
  for (const hole of block.holes) {
    masked = masked.slice(0, hole.start) + maskAll(realText.slice(hole.start, hole.end)) + masked.slice(hole.end);
  }
  return masked.slice(0, block.bodyStart) + realText.slice(block.bodyStart, block.bodyEnd) + masked.slice(block.bodyEnd);
}

/**
 * A throwaway PHP document built as `<?php` + `scopePrefix` + `head` + `body` (the real span text) + `tail` -
 * the general case whenever a span needs more around it than position-preserving masking can give it without
 * shifting everything after it: an enclosing scope's own declaration (see findScopes/scopesAt/scopeText) placed
 * *before* the span so its variables have something to resolve against, and/or a `head`/`tail` wrapping the span in
 * an actual function call (see buildCallVirtual) so a named argument's label has real call context. Both need
 * inserted text before `body`, which means positions in and after it no longer line up with the real document -
 * callers translate explicitly (see offsetToLineChar/lineCharToOffset) using the prefix's own length
 * (`` `<?php ${scopePrefix}${head}`.length ``).
 */
function buildScopedVirtual(scopePrefix, head, body, tail = "") {
  return `<?php ${scopePrefix}${head}${body}${tail}`;
}

/**
 * A throwaway PHP document that actually *calls* `fnName` with `argsText` (`<?php fnName(argsText)`), instead of
 * buildPhpVirtual's bare masking. Needed specifically for FUNCTION_DIRECTIVES (`@route(route: '/', params: [...])`
 * and the like): a named argument's label (`route:`, `params:`) only has meaning *inside* an actual call to a real
 * function with matching parameter names - bare, uncalled text like `route: '/', params: [...]` has no call
 * context for intelephense to resolve those labels against at all (and isn't even valid standalone PHP - `route:`
 * alone would parse as a `goto` label). `scopePrefix`, when given, is as in buildScopedVirtual.
 */
function buildCallVirtual(fnName, argsText, scopePrefix = "") {
  return buildScopedVirtual(scopePrefix, `${fnName}(`, argsText, ")");
}

/** A flat character offset within `text` -> {line, character}, 0-indexed, same convention as vscode.Position. */
function offsetToLineChar(text, offset) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

/** The inverse of offsetToLineChar: {line, character} -> a flat character offset within `text`. */
function lineCharToOffset(text, lineChar) {
  let offset = 0;
  let line = 0;
  while (line < lineChar.line) {
    const nl = text.indexOf("\n", offset);
    if (nl === -1) return text.length;
    offset = nl + 1;
    line++;
  }
  return offset + lineChar.character;
}

module.exports = {
  findEchoHoles,
  findBraceExpressions,
  findDirectiveArguments,
  findEmbeddedBlocks,
  findScopes,
  scopesAt,
  scopeText,
  FUNCTION_DIRECTIVES,
  maskAll,
  buildPhpVirtual,
  buildBlockVirtual,
  buildScopedVirtual,
  buildCallVirtual,
  offsetToLineChar,
  lineCharToOffset,
};
