"use strict";
/**
 * CastFramework for VS Code: Ctrl+click (and F12, hover) on a component or a view name in a `.cast.php` file opens the file.
 * The syntax colouring is a grammar (syntaxes/), this file is only the navigation. The name-to-file rules live in lib/.
 */
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const { scanComponents, scanHelpers, scanChainCalls } = require("./lib/scan");
const { resolveComponent, resolveLegacyComponent, resolveView, resolveModule, propsOf } = require("./lib/resolve");
const { lookup, listComponents, findProp, specOf } = require("./lib/components");
const { contextAt, diagnose } = require("./lib/complete");
const { camel } = require("./lib/docblock");
const { computeIndents, indentFor, indentString } = require("./lib/indent");
const {
  findEchoHoles,
  findBraceExpressions,
  findDirectiveArguments,
  findEmbeddedBlocks,
  scopesAt,
  scopeText,
  FUNCTION_DIRECTIVES,
  buildPhpVirtual,
  buildBlockVirtual,
  buildScopedVirtual,
  buildCallVirtual,
  offsetToLineChar,
  lineCharToOffset,
} = require("./lib/embedded");

const SELECTOR = { scheme: "file", pattern: "**/*.cast.php" };

/** The folders to search for a document: from the settings, and from config/view.php when it names a components folder. */
function locations(document) {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const root = folder ? folder.uri.fsPath : path.dirname(document.uri.fsPath);
  const config = vscode.workspace.getConfiguration("cast", document.uri);

  const viewsDir = path.resolve(root, config.get("viewsPath", "resources/views"));
  const resourcesDir = path.resolve(root, config.get("resourcesPath", "resources"));
  const ext = config.get("extension", ".cast.php");

  const configured = [].concat(config.get("componentsPath", "resources/views/components"));
  const dirs = configured.map((p) => path.resolve(root, p));

  // config/view.php: 'components' => 'ui'  (relative to the views folder)
  try {
    const source = fs.readFileSync(path.join(root, "config", "view.php"), "utf8");
    const m = /['"]components['"]\s*=>\s*['"]([^'"]+)['"]/.exec(source);
    if (m) {
      const dir = path.resolve(viewsDir, m[1]);
      if (!dirs.includes(dir)) dirs.unshift(dir);
    }
  } catch {
    /* no config/view.php */
  }
  return { root, viewsDir, resourcesDir, componentDirs: dirs, ext };
}

/** @returns {{range: any, file: string|null, tried: string[], label: string, kind: string}[]} */
function references(document) {
  const text = document.getText();
  const where = locations(document);
  const out = [];

  for (const ref of scanComponents(text)) {
    if (ref.name === "Slot") continue;
    const { file, tried } = resolveComponent(ref.name, where.componentDirs, where.ext);
    out.push({ ...ref, label: ref.name, file, tried });
  }
  for (const ref of scanHelpers(text)) {
    let result;
    if (ref.kind === "view") result = resolveView(ref.name, where.viewsDir, where.ext);
    else if (ref.kind === "legacy-component") result = resolveLegacyComponent(ref.name, where.componentDirs, where.ext);
    else result = resolveModule(ref.name, ref.type, where.resourcesDir);
    out.push({ ...ref, label: ref.name, file: result.file, tried: result.tried });
  }

  return out.map((r) => ({
    ...r,
    range: new vscode.Range(document.positionAt(r.start), document.positionAt(r.end)),
  }));
}

const KIND_TITLE = { component: "Component", "legacy-component": "Component (legacy)", view: "View", module: "Module" };

class Links {
  provideDocumentLinks(document) {
    return references(document)
      .filter((r) => r.file)
      .map((r) => {
        const link = new vscode.DocumentLink(r.range, vscode.Uri.file(r.file));
        link.tooltip = `Open ${path.basename(r.file)} (Ctrl+click)`;
        return link;
      });
  }
}

class Definitions {
  provideDefinition(document, position) {
    const hit = references(document).find((r) => r.file && r.range.contains(position));
    return hit ? new vscode.Location(vscode.Uri.file(hit.file), new vscode.Position(0, 0)) : undefined;
  }
}

const BUILTIN_HOVERS = {
  handleEvent: "**handleEvent(event, selector, handler)**\n\nRegisters a delegated event listener on `document`.\n\n- `event`: `'click'`, `'change'`, `'input'`, etc.\n- `selector`: CSS selector (e.g. `'.product_item'`)\n- `handler`: `(e, el) => void` where `el` is the matched element\n\n```js\nhandleEvent('click', '.btn', (e, el) => {\n  console.log('Clicked', el.dataset.id);\n});\n```",
  "Cast.on": "**Cast.on(event, selector, handler)**\n\nDelegated event listener on `document`.\n\n- `handler`: `(e, el) => void` where `el` is the matched element",
  "Cast.update": "**Cast.update(selector, data)**\n\nIn-place reactive update for elements or `<select>` options.\n\n```js\nCast.update('#ship_address', optionsList);\n```",
  "Cast.refresh": "**Cast.refresh(selector, endpoint, options)**\n\nFetches updated component HTML fragment and swaps target in DOM.\n\n```js\nCast.refresh('#card', '/_cast/component/card?id=' + id);\n```",
  "Cast.onLoad": "**Cast.onLoad(callback)**\n\nLifecycle hook triggered on DOMContentLoaded and after DOM fragment refreshes.",
  "@script": "**@script( ... )**\n\nComponent script block. Wrapped in an IIFE and registered once per component. Printed by `@scripts`.",
  "@js": "**@js( ... )**\n\nAlias for `@script(...)`. Component script block wrapped in an IIFE.",
  "@css": "**@css( ... )**\n\nComponent stylesheet block. Scoped to the component and supports dynamic `@{ expr }` CSS variables.\n\n```css\n@css(\n  li.active { border-color: @{ props['role'] === 'admin' ? '#fff' : '#666' }; }\n)\n```",
  "@scripts": "**@scripts**\n\nOutputs all collected component scripts and the `cast.js` runtime before `</body>`.",
  "@styles": "**@styles**\n\nOutputs all collected component stylesheets.",
  "@map": "**@map($collection, fn($item, $i) => ...)**\n\nRenders markup for every item of `$collection` and echoes the result. Backed by `Collection::map()`.\n\n- `$collection`: an array, `stdClass` or `Traversable`\n- callback: `fn($item, $index, $key) => string`\n\n```php\n@map($items, ($item, $i) => return(<Card key={$i}>@{ $item->name }</Card>))\n```",
  "@filter": "**@filter($collection, fn($item) => bool[, fn($item, $i) => ...])**\n\nTwo forms, backed by `Collection::filter()`:\n\n- **Render form** (3 args): filters `$collection`, then renders and echoes each remaining item with the 3rd callback.\n- **Standalone form** (2 args): reassigns `$collection` in place to the filtered array/object — nothing is echoed.\n\n```php\n@filter($items, ($item) => $item->qty > 0)\n```",
  return: "**return(...)** *(inside an expression)*\n\nCompiles the markup inside the parentheses and returns it as a string, so a chunk of HTML/components can be produced from inside a callback or `@{ }` expression (e.g. a `@map`/`@filter` callback). Implemented as an immediately-invoked closure that buffers output with `ob_start()`/`ob_get_clean()` and captures the surrounding scope's variables.",
  "@render": "**@render(...)** *(inside an expression)*\n\nAlias for `return(...)` inside an expression: compiles the markup inside the parentheses and returns it as a string from the current callback/expression.",
};

/**
 * `@htchars`/`@route`/`@cast`/`@csrf`/`@alerts`/`@modules` (FUNCTION_DIRECTIVES, see lib/embedded.js) don't get a
 * hardcoded hover entry above: they're each a thin alias for a real PHP function that already has its own
 * docblock, so EmbeddedFunctionHovers below bridges to *that* function's real hover instead of a hand-maintained
 * copy that would drift out of sync. This map is only for a short Cast-specific note worth adding on top of the
 * real function's own doc - currently just the `@cast` vs `@render`/`return(...)` naming collision, which the real
 * `__cast()` function's own docblock (about the SPA client) has no reason to mention.
 */
const FUNCTION_DIRECTIVE_NOTES = {
  cast: "\n\n---\nNot to be confused with `@render(...)`/`return(...)`, which compile markup inside an expression - a different thing with a similar old name.",
};

class Hovers {
  provideHover(document, position) {
    const wordRange = document.getWordRangeAtPosition(position, /[@A-Za-z0-9_.]+/);
    if (wordRange) {
      const word = document.getText(wordRange);
      if (BUILTIN_HOVERS[word]) {
        return new vscode.Hover(new vscode.MarkdownString(BUILTIN_HOVERS[word]), wordRange);
      }
      if (word === "@" && document.getText().charAt(document.offsetAt(wordRange.end)) === "{") {
        return new vscode.Hover(new vscode.MarkdownString("**@{ ... }**\n\nAn echo hole: compiles the PHP expression inside and prints its value (like `<?= ... ?>`). Can itself contain `return(...)`/`@render(...)` to print a rendered chunk of markup."), wordRange);
      }
    }

    const chain = scanChainCalls(document.getText()).find((c) => new vscode.Range(document.positionAt(c.start), document.positionAt(c.end)).contains(position));
    if (chain) {
      const range = new vscode.Range(document.positionAt(chain.start), document.positionAt(chain.end));
      const md = chain.method === "map"
        ? "**.map(fn($item, $i) => ...)** *(fluent chain)*\n\nPart of `@$var.filter(...).map(...)`. Maps the chain's current collection; the chain's **final** `.map()` is what gets echoed. Single-argument callback: `fn($item, $index) => string`.\n\nBacked by `Collection::map()`."
        : "**.filter(fn($item) => bool)** *(fluent chain)*\n\nPart of `@$var.filter(...).map(...)`. Narrows the chain's current collection to items where the callback returns true, then passes the result on to the next `.filter()`/`.map()`. Single-argument callback: `fn($item) => bool`.\n\nBacked by `Collection::filter()`.";
      return new vscode.Hover(new vscode.MarkdownString(md), range);
    }

    const hit = references(document).find((r) => r.range.contains(position));
    if (!hit) return undefined;

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${KIND_TITLE[hit.kind] || "Cast"}** \`${hit.label}\`\n\n`);
    if (hit.file) {
      md.appendMarkdown(`\`${hit.file}\`\n\n`);
      if (hit.kind === "component" || hit.kind === "legacy-component") {
        try {
          const props = propsOf(fs.readFileSync(hit.file, "utf8"));
          if (props.length) md.appendMarkdown(`Props: ${props.map((p) => "`" + p + "`").join(", ")}\n\n`);
        } catch {
          /* unreadable file: no props */
        }
      }
      md.appendMarkdown("Ctrl+click to open.");
    } else {
      md.appendMarkdown("No file found. Looked for:\n\n" + hit.tried.slice(0, 8).map((t) => "- `" + t + "`").join("\n"));
    }
    return new vscode.Hover(md, hit.range);
  }
}

// ------------------------------------------------------------------ embedded PHP/CSS/JS (virtual documents)

/**
 * Real IntelliSense inside `@{ expr }` and `@css(...)`/`@script(...)`/`@js(...)` bodies: a throwaway `.php`/`.css`/`.js`
 * document is built with everything else in the file masked to spaces (see lib/embedded.js), and hover/completion
 * requests are forwarded to it via VS Code's own built-in providers for that language - the same technique
 * Vue/Svelte-family extensions use for embedded languages. Newlines are never touched, so the hovered position maps
 * to the identical line/column in the virtual document: no coordinate translation is needed anywhere here.
 */
/** A short, stable (per document+span) hash: only used to reuse the same virtual doc across repeated hovers. */
function spanKey(uri, start) {
  const s = `${uri}:${start}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Replaced with a real opener inside activate() (same convention as the diagnostics collection below: nothing that
// needs a live `vscode` instance - EventEmitter, content providers - is constructed at module load time).
let openEmbedded = async () => undefined;

/** Registers the `cast-embedded:` scheme and returns its content provider for `activate()` to subscribe. */
function createEmbeddedProvider() {
  const embeddedContents = new Map();
  const embeddedEmitter = new vscode.EventEmitter();
  openEmbedded = async (key, ext, content) => {
    const uri = vscode.Uri.parse(`cast-embedded:/${key}.${ext}`);
    if (embeddedContents.get(uri.toString()) !== content) {
      embeddedContents.set(uri.toString(), content);
      embeddedEmitter.fire(uri);
    }
    return vscode.workspace.openTextDocument(uri);
  };
  return {
    onDidChange: embeddedEmitter.event,
    provideTextDocumentContent(uri) {
      return embeddedContents.get(uri.toString()) ?? "";
    },
  };
}

const BLOCK_LANGUAGE = { css: "css", script: "javascript", js: "javascript" };
const BLOCK_EXT = { css: "css", script: "js", js: "js" };

/**
 * Finds the span under `position` - an `@{ }` echo hole, a bare `={ }` attribute expression, a directive's own
 * `@word(...)` argument list (@if/@foreach/@map/@htchars/...), or a `@css`/`@script`/`@js` body - and the matching
 * virtual document to bridge hover/completion/definition requests to. Checked most-specific-first, since e.g. a
 * `@{ }` hole nested inside a `@map(...)` callback should bridge to just that hole, not the whole directive.
 *
 * @returns {Promise<{vdoc, position: any, toReal?: (p: any) => any}|undefined>} `position` is where to ask the
 *   virtual document (identical to the real `position` for most spans; translated for a FUNCTION_DIRECTIVES
 *   argument list, see openCallVirtual). `toReal`, only set for a translated span, maps a position *in the virtual
 *   document* back to the real one - used to fix up a hover's returned range.
 */
async function embeddedTarget(document, position) {
  if (!/\.cast\.php$/.test(document.uri.fsPath)) return undefined;
  const text = document.getText();
  const offset = document.offsetAt(position);

  const hole = findEchoHoles(text).find((h) => offset > h.exprStart && offset < h.exprEnd);
  if (hole) return openPhpVirtual(document, hole, text, offset);

  const brace = findBraceExpressions(text).find((b) => offset > b.exprStart && offset < b.exprEnd);
  if (brace) return openPhpVirtual(document, brace, text, offset);

  const args = findDirectiveArguments(text).find((d) => offset > d.exprStart && offset < d.exprEnd);
  if (args) {
    const fn = FUNCTION_DIRECTIVES[args.word];
    if (fn) return openCallVirtual(document, args, text, fn, offset);
    return openPhpVirtual(document, args, text, offset);
  }

  const block = findEmbeddedBlocks(text).find((b) => offset >= b.bodyStart && offset <= b.bodyEnd);
  if (block) {
    const ext = BLOCK_EXT[block.kind];
    const languageId = BLOCK_LANGUAGE[block.kind];
    const vdoc = await openEmbedded(spanKey(document.uri, block.start), ext, buildBlockVirtual(text, block));
    if (vdoc.languageId !== languageId) await vscode.languages.setTextDocumentLanguage(vdoc, languageId);
    return { vdoc, position };
  }

  return undefined;
}

/**
 * Builds the `{vdoc, position, toReal}` triple for a span bridged into a virtual document assembled as
 * `<?php ` + each `scope`'s own declaration (see findScopes/scopesAt/scopeText) + `headText` + the span's own real
 * text + `tailText` (`virtualText`, already built this way by the caller via buildScopedVirtual/buildCallVirtual -
 * kept in sync with the segment boundaries computed here, which must mirror that same concatenation exactly).
 *
 * `toReal` maps ANY virtual position back to a real one, not just within the span's own text: a go-to-definition
 * result can resolve to a scope's own declaration just as easily (see findScopes) - a real position for a
 * "verbatim" scope (its own real source, reused as-is: clicking through to it is a real jump, same as clicking the
 * real `@foreach`/`@for`/etc. text itself would be), or its directive's own position for a "synthetic" one (a
 * constructed stand-in like `foreach ($c as $k => $v)` has no single real range of its own to point at - the
 * directive call itself, `scope.at`, is the closest real thing there). A position inside `headText`/`tailText`
 * (literal call syntax like `route(`/`)`, no real counterpart at all) falls back to the span's own start/end.
 * Without this, a result landing in any of these non-span regions would point at the throwaway virtual document
 * itself - which VS Code cannot open as a real editor (the symptom this translation exists to prevent).
 */
async function openTranslated(document, span, scopes, text, headText, tailText, offset, virtualText) {
  let cursor = "<?php ".length;
  const ranges = [];
  for (const s of scopes) {
    const t = scopeText(text, s) + "; ";
    ranges.push({ vStart: cursor, vEnd: cursor + t.length, real: s.kind === "verbatim" ? { start: s.start, end: s.end } : null, fallback: s.at });
    cursor += t.length;
  }
  ranges.push({ vStart: cursor, vEnd: (cursor += headText.length), real: null, fallback: span.exprStart });
  const bodyStart = cursor;
  ranges.push({ vStart: cursor, vEnd: (cursor += span.exprEnd - span.exprStart), real: { start: span.exprStart, end: span.exprEnd }, fallback: null });
  ranges.push({ vStart: cursor, vEnd: cursor + tailText.length, real: null, fallback: span.exprEnd });

  const vdoc = await openEmbedded(spanKey(document.uri, span.start), "php", virtualText);
  if (vdoc.languageId !== "php") await vscode.languages.setTextDocumentLanguage(vdoc, "php");

  const lc = offsetToLineChar(virtualText, bodyStart + (offset - span.exprStart));
  return {
    vdoc,
    position: new vscode.Position(lc.line, lc.character),
    toReal: (vpos) => {
      const vOffset = lineCharToOffset(virtualText, { line: vpos.line, character: vpos.character });
      const r = ranges.find((r) => vOffset >= r.vStart && vOffset <= r.vEnd) || ranges[ranges.length - 1];
      if (r.real) return document.positionAt(Math.max(r.real.start, Math.min(r.real.start + (vOffset - r.vStart), r.real.end)));
      return document.positionAt(r.fallback ?? span.exprStart);
    },
  };
}

/**
 * Shared by every PHP-bridged span kind (echo hole, brace expression, directive arguments). When the span has no
 * enclosing scope to expose (see findScopes/scopesAt), position-preserving masking (buildPhpVirtual) is used, same
 * as always - no translation needed. When it does, the scope's own declaration has to go *before* the span
 * (buildScopedVirtual), which shifts every position after it, so this goes through the same translation
 * `openCallVirtual`'s call-wrap already needs (see openTranslated).
 */
async function openPhpVirtual(document, span, text, offset) {
  const scopes = scopesAt(text, span.exprStart);
  if (!scopes.length) {
    const vdoc = await openEmbedded(spanKey(document.uri, span.start), "php", buildPhpVirtual(text, span.exprStart, span.exprEnd));
    if (vdoc.languageId !== "php") await vscode.languages.setTextDocumentLanguage(vdoc, "php");
    return { vdoc, position: document.positionAt(offset) };
  }
  const scopePrefix = scopes.map((s) => scopeText(text, s) + "; ").join("");
  const argsText = text.slice(span.exprStart, span.exprEnd);
  const virtualText = buildScopedVirtual(scopePrefix, "", argsText, "");
  return openTranslated(document, span, scopes, text, "", "", offset, virtualText);
}

/**
 * For a FUNCTION_DIRECTIVES argument list (`@route(route: '/', params: [...])`): a virtual doc that actually
 * *calls* `fnName` with the real argument text (buildCallVirtual), so named-argument labels resolve against the
 * real function's own parameter names - see that function's doc for why the bare-masking approach can't do this.
 * Also prepends any enclosing scope's own declaration (same idea as openPhpVirtual, see findScopes/scopesAt/
 * scopeText), so a variable like `@route($path)`'s `$path` - declared by an enclosing `@foreach` - also resolves.
 */
async function openCallVirtual(document, span, text, fnName, offset) {
  const scopes = scopesAt(text, span.exprStart);
  const scopePrefix = scopes.map((s) => scopeText(text, s) + "; ").join("");
  const argsText = text.slice(span.exprStart, span.exprEnd);
  const virtualText = buildCallVirtual(fnName, argsText, scopePrefix);
  return openTranslated(document, span, scopes, text, `${fnName}(`, ")", offset, virtualText);
}

class EmbeddedHovers {
  async provideHover(document, position) {
    // the literal `@{`/`@css`/`handleEvent` etc. delimiters/builtins are answered by Hovers; do not shadow them
    const wordRange = document.getWordRangeAtPosition(position, /[@A-Za-z0-9_.]+/);
    if (wordRange && BUILTIN_HOVERS[document.getText(wordRange)]) return undefined;

    const target = await embeddedTarget(document, position);
    if (!target) return undefined;
    const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", target.vdoc.uri, target.position);
    if (!hovers || !hovers.length) return undefined;
    const vrange = hovers[0].range;
    const range = target.toReal && vrange ? new vscode.Range(target.toReal(vrange.start), target.toReal(vrange.end)) : vrange;
    return new vscode.Hover(hovers[0].contents, range);
  }
}

class EmbeddedCompletions {
  async provideCompletionItems(document, position) {
    const target = await embeddedTarget(document, position);
    if (!target) return undefined;
    const list = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", target.vdoc.uri, target.position);
    return list ? list.items : undefined;
  }
}

/**
 * Parameter-name inlay hints (`route: `) for FUNCTION_DIRECTIVES calls (`@route(...)`, `@htchars(...)`, ...): a
 * real PHP call (`<?= route(...) ?>`) already gets these natively from intelephense, since it is genuine `<?php ?>`
 * code - a directive-form call is inert text to it without a bridge, exactly like hover/completion/definition
 * needed their own. Reuses `openCallVirtual`'s call-wrapped virtual document (so a hint can show for an *omitted*
 * parameter too, e.g. `params: []` for `route()`'s second parameter, the same as the real function call would) and
 * translates each returned hint's own position back to the real document with `toReal`.
 * Unlike the other embedded providers (asked about a single position), inlay hints are requested for a whole
 * `range` at once, so every FUNCTION_DIRECTIVES call overlapping it is bridged, not just one.
 */
class EmbeddedInlayHints {
  async provideInlayHints(document, range) {
    if (!/\.cast\.php$/.test(document.uri.fsPath)) return undefined;
    const text = document.getText();
    const startOffset = document.offsetAt(range.start);
    const endOffset = document.offsetAt(range.end);
    const hints = [];
    for (const d of findDirectiveArguments(text)) {
      const fn = FUNCTION_DIRECTIVES[d.word];
      if (!fn || d.end < startOffset || d.start > endOffset) continue;
      const target = await openCallVirtual(document, d, text, fn, d.exprStart);
      const full = new vscode.Range(new vscode.Position(0, 0), target.vdoc.positionAt(target.vdoc.getText().length));
      const vhints = await vscode.commands.executeCommand("vscode.executeInlayHintProvider", target.vdoc.uri, full);
      for (const h of vhints || []) {
        const hint = new vscode.InlayHint(target.toReal(h.position), h.label, h.kind);
        hint.paddingLeft = h.paddingLeft;
        hint.paddingRight = h.paddingRight;
        hint.tooltip = h.tooltip;
        hints.push(hint);
      }
    }
    return hints;
  }
}

/**
 * Ctrl+click / F12 inside an `@{ }`/`={ }`/directive-argument span: forwards to PHP's own definition provider
 * against the virtual document. Resolves real external definitions fine (a built-in function like `count`, a
 * user function/class), and - since openPhpVirtual/openCallVirtual also unmask any enclosing `@foreach`/`@map`/
 * `@filter` scope's own declaration into the same virtual doc (see findScopes/scopesAt) - a loop/callback variable
 * used inside that scope's body too: a bare `@{ $item['id'] }` echo hole nested inside a `@map(...)` callback's
 * `return(...)` markup now resolves `$item` back to that `@map`'s own `($item, $i) =>` parameter, and `$label`/
 * `$path` used anywhere inside a `@foreach (... as [$label, $path])` body resolve back to that destructuring.
 * Still a known gap: a plain PHP variable assigned in a `<?php ?>` block earlier in the file (not declared by one
 * of these directives) isn't tracked as a scope, so it won't resolve from inside an unrelated bridged span.
 */
class EmbeddedDefinitions {
  async provideDefinition(document, position) {
    const target = await embeddedTarget(document, position);
    if (!target) return undefined;
    const result = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", target.vdoc.uri, target.position);
    if (!result || !target.toReal) return result;

    // a result pointing back into our own throwaway virtual document (e.g. an enclosing scope's own declaration,
    // see findScopes/scopeText) has to be translated to a real position before it is shown - VS Code cannot open
    // a cast-embedded: URI as a real editor tab ("the editor could not be opened because the file was not found").
    const vdocKey = target.vdoc.uri.toString();
    return result.map((r) => {
      if (r.uri && r.uri.toString() === vdocKey) {
        return new vscode.Location(document.uri, target.toReal(r.range.start));
      }
      if (r.targetUri && r.targetUri.toString() === vdocKey) {
        const at = target.toReal((r.targetSelectionRange || r.targetRange).start);
        const range = new vscode.Range(at, at);
        return { targetUri: document.uri, targetRange: range, targetSelectionRange: range };
      }
      return r; // a genuinely external definition (a real function/class in its own file) - unchanged
    });
  }
}

/**
 * Hovering a FUNCTION_DIRECTIVES word itself (`@route`, `@htchars`, ...) - not its arguments, EmbeddedHovers
 * already covers those: bridges to the real PHP function's own hover (its actual docblock) via a tiny one-line
 * virtual document, rather than a hand-maintained copy. `@route(...)` and `route(...)` end up showing the exact
 * same hover, because they're asking the same question of the same real function.
 */
class FunctionDirectiveHovers {
  async provideHover(document, position) {
    if (!/\.cast\.php$/.test(document.uri.fsPath)) return undefined;
    const wordRange = document.getWordRangeAtPosition(position, /@[A-Za-z_]\w*/);
    if (!wordRange) return undefined;
    const word = document.getText(wordRange).slice(1);
    const fn = FUNCTION_DIRECTIVES[word];
    if (!fn) return undefined;

    const vdoc = await openEmbedded(spanKey(document.uri, document.offsetAt(wordRange.start)), "php", `<?php ${fn}`);
    if (vdoc.languageId !== "php") await vscode.languages.setTextDocumentLanguage(vdoc, "php");
    const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", vdoc.uri, new vscode.Position(0, 6 + fn.length));
    if (!hovers || !hovers.length) return undefined;

    const note = FUNCTION_DIRECTIVE_NOTES[word];
    const contents = Array.isArray(hovers[0].contents) ? hovers[0].contents.slice() : [hovers[0].contents];
    if (note) contents.push(new vscode.MarkdownString(note));
    return new vscode.Hover(contents, wordRange);
  }
}

// ------------------------------------------------------------------ component docs

/** The prop name as it is written in a tag, in the style of the `cast.propCase` setting. */
function spell(name, style) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s_-]+/);
  if (style === "kebab") return words.join("-");
  if (style === "snake") return words.join("_");
  return camel(name);
}

function markdownFor(file, spec, tag) {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**<${tag}>**`);
  if (spec.deprecated) md.appendMarkdown(` — *deprecated${spec.deprecated === true ? "" : ": " + spec.deprecated}*`);
  md.appendMarkdown("\n\n");
  if (spec.description) md.appendMarkdown(spec.description + "\n\n");

  if (spec.props.length) {
    md.appendMarkdown("| Prop | Type | | Description |\n| --- | --- | --- | --- |\n");
    for (const p of spec.props) {
      const flag = p.required ? "required" : p.default !== null ? `= ${p.default}` : "optional";
      const text = (p.description || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      md.appendMarkdown(`| \`${p.name}\` | ${p.type ? "`" + p.type.replace(/\|/g, "\\|") + "`" : ""} | ${flag.replace(/\|/g, "\\|")} | ${text} |\n`);
    }
    md.appendMarkdown("\n");
  }
  if (spec.slots.length) md.appendMarkdown("Slots: " + spec.slots.map((s) => `\`${s.name}\`${s.description ? " (" + s.description + ")" : ""}`).join(", ") + "\n\n");
  for (const example of spec.examples) md.appendCodeblock(example, "php");
  md.appendMarkdown(`\`${file}\``);
  return md;
}

function propMarkdown(tag, prop) {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${prop.name}**` + (prop.type ? `: \`${prop.type}\`` : "") + (prop.required ? " — required" : prop.default !== null ? ` — default \`${prop.default}\`` : " — optional") + "\n\n");
  if (prop.description) md.appendMarkdown(prop.description + "\n\n");
  if (prop.values.length) md.appendMarkdown("One of: " + prop.values.map((v) => `\`${v}\``).join(", ") + "\n\n");
  md.appendMarkdown(`*prop of* \`<${tag}>\``);
  return md;
}

/** Which refs (components and attributes) the cursor is on, for hover and go-to-definition. */
function componentAt(document, position) {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const where = locations(document);
  for (const ref of scanComponents(text)) {
    if (ref.name === "Slot") continue;
    if (offset >= ref.start && offset <= ref.end) return { kind: "tag", ref, where, found: lookup(ref.name, where) };
    for (const attr of ref.attrs || []) {
      if (attr.name && offset >= attr.nameStart && offset <= attr.nameEnd) {
        const found = lookup(ref.name, where);
        return { kind: "attribute", ref, attr, where, found, prop: found ? findProp(found.spec, attr.name) : null };
      }
    }
  }
  return null;
}

class Completions {
  provideCompletionItems(document, position) {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const context = contextAt(text, offset);
    if (!context) return undefined;

    const where = locations(document);
    const config = vscode.workspace.getConfiguration("cast", document.uri);
    const style = config.get("propCase", "camel");
    const range = (a, b) => new vscode.Range(document.positionAt(a), document.positionAt(b));
    const items = [];
    const Kind = vscode.CompletionItemKind;

    if (context.type === "tag") {
      for (const { tag, file } of listComponents(where.componentDirs, where.ext)) {
        const spec = specOf(file, where);
        const item = new vscode.CompletionItem(tag, Kind.Class);
        item.detail = spec && spec.description ? spec.description.split("\n")[0] : "component";
        if (spec) item.documentation = markdownFor(file, spec, tag);
        const required = spec ? spec.props.filter((p) => p.required && !p.inferred) : [];
        item.insertText = new vscode.SnippetString(tag + required.map((p, i) => ` ${spell(p.name, style)}=` + (p.kind === "string" ? `"$${i + 1}"` : `{$${i + 1}}`)).join(""));
        item.range = range(context.start, context.end);
        item.sortText = spec && spec.deprecated ? "1" + tag : "0" + tag;
        if (spec && spec.deprecated) item.tags = [1];
        items.push(item);
      }
      return items;
    }

    const found = lookup(context.ref.name, where);

    if (context.type === "slot") {
      const parent = context.parent && lookup(context.parent.name, where);
      for (const slot of parent ? parent.spec.slots : []) {
        const item = new vscode.CompletionItem(slot.name, Kind.Field);
        item.detail = slot.description;
        item.range = range(context.start, context.end);
        items.push(item);
      }
      return items;
    }
    if (!found) return undefined;

    if (context.type === "attribute") {
      const used = context.used;
      for (const prop of found.spec.props) {
        if (used.has(camel(prop.name))) continue;
        const name = spell(prop.name, style);
        const item = new vscode.CompletionItem(name, Kind.Property);
        item.detail = [prop.type, prop.required ? "required" : prop.default !== null ? `default ${prop.default}` : "optional"].filter(Boolean).join(" · ");
        item.documentation = propMarkdown(context.ref.name, prop);
        item.sortText = (prop.deprecated ? "2" : prop.required ? "0" : prop.inferred ? "1z" : "1") + name;
        if (prop.deprecated) item.tags = [1];
        const placeholder = prop.values.length ? `\${1|${prop.values.join(",")}|}` : "$1";
        item.insertText = new vscode.SnippetString(prop.kind === "bool" ? name : prop.kind === "string" ? `${name}="${placeholder}"` : `${name}={$1}`);
        item.range = range(context.start, context.end);
        if (prop.kind !== "bool") item.command = { command: "editor.action.triggerSuggest", title: "values" };
        items.push(item);
      }
      return items;
    }

    if (context.type === "value") {
      const prop = findProp(found.spec, context.attr.name);
      if (!prop) return undefined;
      const values = prop.kind === "bool" ? ["true", "false"] : prop.values;
      for (const value of values) {
        const item = new vscode.CompletionItem(value, Kind.EnumMember);
        item.detail = prop.name;
        if (prop.kind === "bool") {
          item.insertText = context.quoted ? value : `{${value}}`;
        } else {
          item.insertText = context.quoted ? value : `"${value}"`;
        }
        item.range = range(context.start, context.end);
        items.push(item);
      }
      return items;
    }
    return undefined;
  }
}

class ComponentHovers {
  provideHover(document, position) {
    const hit = componentAt(document, position);
    if (!hit || !hit.found) return undefined;
    const range = new vscode.Range(
      document.positionAt(hit.kind === "tag" ? hit.ref.start : hit.attr.nameStart),
      document.positionAt(hit.kind === "tag" ? hit.ref.end : hit.attr.nameEnd)
    );
    if (hit.kind === "tag") return new vscode.Hover(markdownFor(hit.found.file, hit.found.spec, hit.ref.name), range);
    return hit.prop ? new vscode.Hover(propMarkdown(hit.ref.name, hit.prop), range) : undefined;
  }
}

/** Ctrl+click on a prop name: the line in the component file that documents or defaults it. */
class PropDefinitions {
  provideDefinition(document, position) {
    const hit = componentAt(document, position);
    if (!hit || hit.kind !== "attribute" || !hit.found || !hit.prop) return undefined;
    let source;
    try {
      source = fs.readFileSync(hit.found.file, "utf8");
    } catch {
      return undefined;
    }
    const name = hit.prop.name.replace(/[$]/g, "");
    const re = new RegExp(`@(?:var|param|prop|property)[^\\n]*\\$${name}\\b|\\$${name}\\s*\\?\\?=`);
    const m = re.exec(source);
    if (!m) return undefined;
    const before = source.slice(0, m.index);
    const line = before.split("\n").length - 1;
    const column = m.index - (before.lastIndexOf("\n") + 1);
    return new vscode.Location(vscode.Uri.file(hit.found.file), new vscode.Position(line, column));
  }
}

const SEVERITY = { hint: 3, warning: 1 };

/** Problems in component tags, shown as hints (the default) or warnings; `cast.diagnostics: off` turns them off. */
function publishDiagnostics(document, collection) {
  if (!/\.cast\.php$/.test(document.uri.fsPath)) return;
  const level = vscode.workspace.getConfiguration("cast", document.uri).get("diagnostics", "hint");
  if (level === "off" || !(level in SEVERITY)) {
    collection.set(document.uri, []);
    return;
  }
  const where = locations(document);
  const problems = diagnose(document.getText(), (tag) => lookup(tag, where));
  collection.set(document.uri, problems.map((p) => {
    const sev = p.severity === "error" ? vscode.DiagnosticSeverity.Error
      : (p.severity === "warning" ? vscode.DiagnosticSeverity.Warning : SEVERITY[level]);
    const d = new vscode.Diagnostic(new vscode.Range(document.positionAt(p.start), document.positionAt(p.end)), p.message, sev);
    d.source = "cast";
    d.code = p.kind;
    d.cast = p;
    if (p.kind === "deprecated" || p.kind === "deprecated-prop") d.tags = [2];
    return d;
  }));
}

class Fixes {
  provideCodeActions(document, range, context) {
    const actions = [];
    for (const d of context.diagnostics) {
      const p = d.cast;
      if (!p) continue;
      if (p.kind === "missing") {
        const style = vscode.workspace.getConfiguration("cast", document.uri).get("propCase", "camel");
        const found = lookup(p.tag, locations(document));
        const text = p.missing.map((m) => {
          const prop = found && findProp(found.spec, m);
          return ` ${spell(m, style)}=` + (prop && prop.kind === "string" ? '""' : "{}");
        }).join("");
        actions.push(edit(`Add ${p.missing.map((m) => `"${m}"`).join(", ")}`, document, d, (we) => we.insert(document.uri, document.positionAt(p.insertAt), text)));
      } else if (p.kind === "unknown" && p.suggestion) {
        const style = vscode.workspace.getConfiguration("cast", document.uri).get("propCase", "camel");
        actions.push(edit(`Change to "${spell(p.suggestion, style)}"`, document, d, (we) => we.replace(document.uri, d.range, spell(p.suggestion, style))));
      } else if (p.kind === "value" && p.values) {
        for (const v of p.values) actions.push(edit(`Use "${v}"`, document, d, (we) => we.replace(document.uri, d.range, v)));
      }
    }
    return actions;
  }
}

function edit(title, document, diagnostic, apply) {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.edit = new vscode.WorkspaceEdit();
  apply(action.edit);
  return action;
}

// ---------------------------------------------------------------------------------------------------------------- indentation

/** Tab settings: the editor's own for the document being formatted, else the workspace's. */
function tabOptions(options) {
  if (options && options.tabSize) return { tabSize: Number(options.tabSize), insertSpaces: options.insertSpaces !== false };
  const editor = vscode.window && vscode.window.activeTextEditor;
  if (editor && editor.options && editor.options.tabSize) return { tabSize: Number(editor.options.tabSize), insertSpaces: editor.options.insertSpaces !== false };
  return { tabSize: 4, insertSpaces: true };
}

/** Edits that change only the leading whitespace of the lines in [first, last] (all lines when omitted). */
function indentEdits(document, options, first = 0, last = Infinity) {
  const lines = document.getText().split(/\r?\n/);
  const { depths } = computeIndents(lines);
  const edits = [];
  for (let i = first; i <= Math.min(last, lines.length - 1); i++) {
    const old = /^[ \t]*/.exec(lines[i])[0];
    if (/^\s*$/.test(lines[i])) {
      if (lines[i].length) edits.push(vscode.TextEdit.replace(new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, lines[i].length)), ""));
      continue;
    }
    if (depths[i] === null) continue;
    const wanted = indentString(depths[i], tabOptions(options));
    if (wanted !== old) edits.push(vscode.TextEdit.replace(new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, old.length)), wanted));
  }
  return edits;
}

class Formatter {
  provideDocumentFormattingEdits(document, options) {
    return indentEdits(document, options);
  }
  provideDocumentRangeFormattingEdits(document, range, options) {
    return indentEdits(document, options, range.start.line, range.end.line);
  }
}

const CLOSING_LINE = /^\s*(<\/[A-Za-z]|<\?(php|=)?\s*(end\w+|else\w*|\})|@(endif|endfor|endforeach|endforelse|endwhile|endunless|endisset|endswitch|endphp|else|elseif|empty|case|default)\b)/;

/**
 * Keeps the indent right while typing, whether or not `editor.formatOnType` is on: after Enter the new line gets the right indent
 * (and the line just finished is corrected: you typed `@endif` or `</div>` and pressed Enter), and a line that starts with a closing tag,
 * `<?php endif ?>` or `@endif` / `@else` moves back as soon as it is typed.
 */
function autoIndent(event) {
  const document = event.document;
  if (!document.uri || !String(document.uri.fsPath).endsWith(".cast.php")) return;
  if (!vscode.workspace.getConfiguration("cast", document.uri).get("autoIndent", true)) return;
  if (autoIndent.busy || event.contentChanges.length !== 1) return;
  const change = event.contentChanges[0];
  const lines = document.getText().split(/\r?\n/);

  const targets = [];
  if (/^\r?\n[ \t]*$/.test(change.text)) {
    const next = change.range.start.line + 1;
    targets.push(next);
    if (next - 1 >= 0) targets.push(next - 1);
  } else if (change.text.length === 1 && /[>a-z}]/i.test(change.text)) {
    const line = change.range.start.line;
    if (CLOSING_LINE.test(lines[line] || "")) targets.push(line);
  }
  if (!targets.length) return;

  const options = tabOptions(null);
  const edit = new vscode.WorkspaceEdit();
  let any = false;
  for (const line of targets) {
    const wanted = indentFor(lines, line, options);
    if (wanted === null) continue;
    const old = /^[ \t]*/.exec(lines[line])[0];
    if (wanted !== old) {
      edit.replace(document.uri, new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, old.length)), wanted);
      any = true;
    }
  }
  if (!any) return;
  autoIndent.busy = true;
  Promise.resolve(vscode.workspace.applyEdit(edit)).finally(() => (autoIndent.busy = false));
}

/** "Cast: Fix indentation": the selection, or the whole view. */
async function fixIndentation() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !String(editor.document.uri.fsPath).endsWith(".cast.php")) return;
  const selection = editor.selection;
  const options = tabOptions(editor.options);
  const edits = selection && !selection.isEmpty ? indentEdits(editor.document, options, selection.start.line, selection.end.line) : indentEdits(editor.document, options);
  const edit = new vscode.WorkspaceEdit();
  for (const e of edits) edit.replace(editor.document.uri, e.range, e.newText);
  await vscode.workspace.applyEdit(edit);
}

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection("cast");
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(SELECTOR, new Links()),
    vscode.languages.registerDefinitionProvider(SELECTOR, new Definitions()),
    vscode.languages.registerDefinitionProvider(SELECTOR, new PropDefinitions()),
    vscode.languages.registerDefinitionProvider(SELECTOR, new EmbeddedDefinitions()),
    vscode.languages.registerHoverProvider(SELECTOR, new ComponentHovers()),
    vscode.languages.registerHoverProvider(SELECTOR, new Hovers()),
    vscode.languages.registerHoverProvider(SELECTOR, new EmbeddedHovers()),
    vscode.languages.registerHoverProvider(SELECTOR, new FunctionDirectiveHovers()),
    vscode.languages.registerCompletionItemProvider(SELECTOR, new Completions(), "<", " ", '"', "'", "=", "."),
    vscode.languages.registerCompletionItemProvider(SELECTOR, new EmbeddedCompletions(), ".", ":", '"', "'", "(", " "),
    vscode.languages.registerCodeActionsProvider(SELECTOR, new Fixes(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    diagnostics
  );
  // the embedded PHP/CSS/JS bridge needs EventEmitter and a content-provider registry; skipped where either is absent
  // (older API surface, or the lightweight test mock) - EmbeddedHovers/EmbeddedCompletions stay registered either way
  // and simply find nothing to bridge to, since `openEmbedded` is left as its no-op default.
  if (vscode.EventEmitter && vscode.workspace.registerTextDocumentContentProvider) {
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("cast-embedded", createEmbeddedProvider()));
  }
  const formatter = new Formatter();
  if (vscode.languages.registerDocumentFormattingEditProvider) {
    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(SELECTOR, formatter),
      vscode.languages.registerDocumentRangeFormattingEditProvider(SELECTOR, formatter)
    );
  }
  if (vscode.languages.registerInlayHintsProvider) {
    context.subscriptions.push(vscode.languages.registerInlayHintsProvider(SELECTOR, new EmbeddedInlayHints()));
  }
  if (vscode.commands && vscode.commands.registerCommand) context.subscriptions.push(vscode.commands.registerCommand("cast.fixIndentation", fixIndentation));
  if (vscode.workspace.onDidChangeTextDocument && !vscode.workspace.onDidOpenTextDocument) {
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(autoIndent)); // (the diagnostics block below registers its own)
  }

  // problems are refreshed when a file opens or changes (a short delay while typing), and when settings change
  const timers = new Map();
  const refresh = (document) => {
    clearTimeout(timers.get(document.uri.fsPath));
    timers.set(document.uri.fsPath, setTimeout(() => publishDiagnostics(document, diagnostics), 250));
  };
  if (vscode.workspace.onDidOpenTextDocument) {
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(refresh),
      vscode.workspace.onDidChangeTextDocument((e) => {
        refresh(e.document);
        autoIndent(e);
      }),
      vscode.workspace.onDidCloseTextDocument((d) => diagnostics.delete(d.uri)),
      vscode.workspace.onDidSaveTextDocument(refresh),
      vscode.workspace.onDidChangeConfiguration(() => (vscode.workspace.textDocuments || []).forEach(refresh))
    );
    (vscode.workspace.textDocuments || []).forEach(refresh);
  }
}

function deactivate() {}

module.exports = { activate, deactivate, references, locations, publishDiagnostics, spell, indentEdits, autoIndent, Formatter };
