"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { create, document, Position } = require("./mock-vscode");

/** A project on disk with the given files; returns the activated providers. */
function project(files, settings = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cast-ext-"));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  const vscode = create({ root, settings });
  const original = Module._load;
  Module._load = function (request, ...rest) {
    return request === "vscode" ? vscode : original.call(this, request, ...rest);
  };
  delete require.cache[require.resolve("../extension")];
  const extension = require("../extension");
  Module._load = original;
  extension.activate({ subscriptions: [], globalState: vscode.globalState });
  return { root, providers: vscode.providers, extension, vscode, handlers: vscode.handlers, applied: vscode.applied };
}

const VIEW = "resources/views/items/items.cast.php";

test("activation registers links, definitions and hovers for .cast.php files", () => {
  const { providers } = project({});
  assert.ok(providers.links && providers.definition && providers.hover);
});

test("Ctrl+click: every component tag in a view becomes a link to its file", () => {
  const src = '<Card title="x"><Btns.AddNew /></Card>';
  const { root, providers } = project({
    [VIEW]: src,
    "resources/views/components/card.cast.php": "<div></div>",
    "resources/views/components/btns/add-new.cast.php": "<a></a>",
  });
  const doc = document(path.join(root, VIEW), src);
  const links = providers.links.provideDocumentLinks(doc);
  assert.deepEqual(links.map((l) => path.relative(root, l.target.fsPath)), [
    path.join("resources/views/components/card.cast.php"),
    path.join("resources/views/components/btns/add-new.cast.php"),
    path.join("resources/views/components/card.cast.php"),
  ]);
  // the link covers exactly the tag name
  const card = links[0].range;
  assert.equal(src.slice(doc.offsetAt(card.start), doc.offsetAt(card.end)), "Card");
  assert.match(links[0].tooltip, /card\.cast\.php/);
});

test("Go to Definition on a component name, an included view, a legacy component and a module", () => {
  const src = [
    "<Card />",
    "<?php __includes('layouts.header', $data); ?>",
    "<?= Component('btns.add-new') ?>",
    "<?= __modules('items.items', 'js') ?>",
  ].join("\n");
  const { root, providers } = project({
    [VIEW]: src,
    "resources/views/components/card.cast.php": "",
    "resources/views/layouts/header.cast.php": "",
    "resources/views/components/btns/add-new.php": "",
    "resources/js/items/items.module.js": "",
  });
  const doc = document(path.join(root, VIEW), src);
  const target = (line, character) => {
    const hit = providers.definition.provideDefinition(doc, new Position(line, character));
    return hit && path.relative(root, hit.uri.fsPath);
  };
  assert.equal(target(0, 3), path.join("resources/views/components/card.cast.php"));
  assert.equal(target(1, 22), path.join("resources/views/layouts/header.cast.php"));
  assert.equal(target(2, 20), path.join("resources/views/components/btns/add-new.php"));
  assert.equal(target(3, 20), path.join("resources/js/items/items.module.js"));
  assert.equal(target(1, 2), undefined, "elsewhere there is nothing to open");
});

test("a component without a file gets no link, and the hover says what was looked for", () => {
  const src = "<Missing.Thing />";
  const { root, providers } = project({ [VIEW]: src });
  const doc = document(path.join(root, VIEW), src);
  assert.deepEqual(providers.links.provideDocumentLinks(doc), []);
  assert.equal(providers.definition.provideDefinition(doc, new Position(0, 3)), undefined);
  const hover = providers.hover.provideHover(doc, new Position(0, 3));
  assert.match(hover.contents.value, /No file found/);
  assert.match(hover.contents.value, /missing[\\/]thing\.cast\.php|missing/);
});

test("the hover for a found component shows its file and props", () => {
  const src = "<Card />";
  const { root, providers } = project({
    [VIEW]: src,
    "resources/views/components/card.cast.php": "<?php\n$title ??= 'Untitled';\n$footer ??= null;\n?>\n<section><?= $children ?></section>",
  });
  const hover = providers.hover.provideHover(document(path.join(root, VIEW), src), new Position(0, 2));
  assert.match(hover.contents.value, /\*\*Component\*\* `Card`/);
  assert.match(hover.contents.value, /card\.cast\.php/);
  assert.match(hover.contents.value, /Props: `title`, `footer`/);
});

test("hovering @map, @filter, return(...), @render(...) and the @{ } echo hole explains what goes inside", () => {
  const { root, providers } = project({});
  const hoverAt = (src, index) => providers.hover.provideHover(document(path.join(root, VIEW), src), new Position(0, index));

  const map = hoverAt("@map($items, ($item, $i) => $item)", "@map".length - 2);
  assert.match(map.contents.value, /\*\*@map\(\$collection/);
  assert.match(map.contents.value, /Collection::map/);

  const filter = hoverAt("@filter($items, ($item) => $item->qty > 0)", "@filter".length - 2);
  assert.match(filter.contents.value, /\*\*@filter\(\$collection/);
  assert.match(filter.contents.value, /Collection::filter/);

  const retSrc = "@{ return(<p>x</p>) }";
  const ret = hoverAt(retSrc, retSrc.indexOf("return") + 2);
  assert.match(ret.contents.value, /\*\*return\(\.\.\.\)\*\*/);
  assert.match(ret.contents.value, /ob_start/);

  const renderSrc = "@{ @render(<p>x</p>) }";
  const render = hoverAt(renderSrc, renderSrc.indexOf("@render") + 2);
  assert.match(render.contents.value, /\*\*@render\(\.\.\.\)\*\*/);
  assert.match(render.contents.value, /return\(\.\.\.\)/);

  const holeSrc = "<p>@{ $x }</p>";
  const hole = hoverAt(holeSrc, holeSrc.indexOf("@{"));
  assert.match(hole.contents.value, /\*\*@\{ \.\.\. \}\*\*/);
  assert.match(hole.contents.value, /echo hole/);
});

test("the FUNCTION_DIRECTIVES words (@htchars, @route, @cast, @csrf, @alerts, @modules) have no hardcoded hover text - FunctionDirectiveHovers bridges to the real function's own docblock instead", () => {
  const { root, providers } = project({});
  const hoverAt = (src, index) => providers.hover.provideHover(document(path.join(root, VIEW), src), new Position(0, index));
  for (const word of ["@htchars", "@route", "@cast", "@csrf", "@alerts", "@modules"]) {
    assert.equal(hoverAt(`${word}(x)`, 2), undefined, `${word} has no static Hovers entry left`);
  }
  // @css/@script/@js/@scripts/@styles/@map/@filter/return/@render keep their hardcoded entries (no single
  // real-PHP-function equivalent to bridge to for these)
  assert.ok(providers.functionDirectiveHover, "FunctionDirectiveHovers is registered separately");
});

test("EmbeddedInlayHints is registered when the host API supports it, so @route(...)/@htchars(...) etc. can get the same parameter-name hints a real PHP call gets natively", () => {
  const { providers } = project({});
  assert.ok(providers.inlayHints, "EmbeddedInlayHints is registered");
  assert.equal(typeof providers.inlayHints.provideInlayHints, "function");
});

test("hovering .filter/.map in a fluent @$var.filter(...).map(...) chain explains each segment", () => {
  const { root, providers } = project({});
  const src = "@$items.filter(($i) => $i->active).map(($i) => $i->name)";
  const doc = document(path.join(root, VIEW), src);

  const filterHover = providers.hover.provideHover(doc, new Position(0, src.indexOf("filter") + 2));
  assert.match(filterHover.contents.value, /\*\*\.filter\(fn\(\$item\) => bool\)\*\* \*\(fluent chain\)\*/);
  assert.equal(src.slice(doc.offsetAt(filterHover.range.start), doc.offsetAt(filterHover.range.end)), "filter");

  const mapHover = providers.hover.provideHover(doc, new Position(0, src.lastIndexOf("map") + 1));
  assert.match(mapHover.contents.value, /\*\*\.map\(fn\(\$item, \$i\) => \.\.\.\)\*\* \*\(fluent chain\)\*/);
  assert.equal(src.slice(doc.offsetAt(mapHover.range.start), doc.offsetAt(mapHover.range.end)), "map");

  // the directive form @map(...) (no variable + dot before it) must not be mistaken for a chain segment
  const directive = "@map($items, ($i) => $i)";
  const directiveHover = providers.hover.provideHover(document(path.join(root, VIEW), directive), new Position(0, 2));
  assert.match(directiveHover.contents.value, /\*\*@map\(\$collection/, "the plain directive hover, not the chain one");
});

test("<Slot> is not looked up as a component", () => {
  const src = '<Card><Slot name="left">x</Slot></Card>';
  const { root, providers } = project({ [VIEW]: src, "resources/views/components/card.cast.php": "", "resources/views/components/slot.cast.php": "" });
  const links = providers.links.provideDocumentLinks(document(path.join(root, VIEW), src));
  assert.equal(links.length, 2, "Card and /Card only");
});

test("settings: another components folder, several folders, and another extension", () => {
  const src = "<Card /><Chip />";
  const { root, providers } = project(
    { [VIEW.replace(".cast.php", ".tpl.php")]: src, "ui/card.tpl.php": "", "shared/chip.tpl.php": "" },
    { componentsPath: ["ui", "shared"], extension: ".tpl.php" }
  );
  const doc = document(path.join(root, VIEW.replace(".cast.php", ".tpl.php")), src);
  const links = providers.links.provideDocumentLinks(doc);
  assert.deepEqual(links.map((l) => path.relative(root, l.target.fsPath)), [path.join("ui/card.tpl.php"), path.join("shared/chip.tpl.php")]);
});

test("config/view.php names the components folder: it is searched first", () => {
  const src = "<Card />";
  const { root, providers } = project({
    [VIEW]: src,
    "config/view.php": "<?php return ['ext' => '.cast.php', 'components' => 'ui'];",
    "resources/views/ui/card.cast.php": "",
    "resources/views/components/card.cast.php": "",
  });
  const links = providers.links.provideDocumentLinks(document(path.join(root, VIEW), src));
  assert.equal(path.relative(root, links[0].target.fsPath), path.join("resources/views/ui/card.cast.php"));
});

test("a view with components in { } values and PHP code resolves each one on the right line", () => {
  const src = ['<?php $x = 1; ?>', '<Panel total={$ok ? <Yes /> : <No />}>', '  <Slot name="a"><Btns.Go /></Slot>', '</Panel>'].join("\n");
  const { root, providers } = project({
    [VIEW]: src,
    "resources/views/components/panel.cast.php": "",
    "resources/views/components/yes.cast.php": "",
    "resources/views/components/no.cast.php": "",
    "resources/views/components/btns/go.cast.php": "",
  });
  const doc = document(path.join(root, VIEW), src);
  const links = providers.links.provideDocumentLinks(doc);
  assert.deepEqual(links.map((l) => [l.range.start.line, path.basename(l.target.fsPath)]), [
    [1, "panel.cast.php"],
    [1, "yes.cast.php"],
    [1, "no.cast.php"],
    [2, "go.cast.php"],
    [3, "panel.cast.php"],
  ]);
});

// ------------------------------------------------------------------------------------------------ indentation

const apply = (text, edits) => {
  const lines = text.split("\n");
  for (const e of edits.slice().sort((a, b) => b.range.start.line - a.range.start.line)) {
    const l = e.range.start.line;
    lines[l] = lines[l].slice(0, e.range.start.character) + e.newText + lines[l].slice(e.range.end.character);
  }
  return lines.join("\n");
};

test("Format Document re-indents the whole view and only touches leading whitespace", () => {
  const { providers } = project({});
  const src = '<div>\n<?php if ($a): ?>\n<p>x</p>\n<?php endif ?>\n@foreach ($l as $i)\n<li>@{ $i }</li>\n@endforeach\n</div>';
  const doc = document("/p/" + VIEW, src);
  const out = apply(src, providers.formatting.provideDocumentFormattingEdits(doc, { tabSize: 2, insertSpaces: true }));
  assert.equal(out, '<div>\n  <?php if ($a): ?>\n    <p>x</p>\n  <?php endif ?>\n  @foreach ($l as $i)\n    <li>@{ $i }</li>\n  @endforeach\n</div>');
  assert.deepEqual(providers.formatting.provideDocumentFormattingEdits(document("/p/" + VIEW, out), { tabSize: 2, insertSpaces: true }), [], "nothing to do when it is right");
});

test("Format Document agrees with the LSP's formatCast on doc-comment alignment (single shared scanner, not two)", () => {
  const { providers } = project({});
  const src = "<div>\n<?php\nif ($a) {\n/**\n*Text\n*@param int $x\n*/\n$y = 1;\n}\n?>\n</div>";
  const doc = document("/p/" + VIEW, src);
  const out = apply(src, providers.formatting.provideDocumentFormattingEdits(doc, { tabSize: 4, insertSpaces: true }));
  assert.equal(out, "<div>\n    <?php\n    if ($a) {\n        /**\n         *Text\n         *@param int $x\n         */\n        $y = 1;\n    }\n    ?>\n</div>", "the */ lines align one space in, matching editor/language-core's indentPrefix exactly");
});

test("activate() registers the extension's own Formatter as a fallback when no LSP client could start", () => {
  // vscode-languageclient/node cannot actually construct against this lightweight mock (it extends a base class
  // the mock doesn't shape), so every test run takes the "no client" branch - the one real-world case this can
  // exercise. The "client started, skip the extension's own Formatter" branch is covered by inspection only (see
  // activate(): it registers Formatter inside `if (!client) {...}`, set synchronously inside startLanguageClient
  // before this check runs).
  const { providers } = project({});
  assert.ok(providers.formatting, "the extension's Formatter is the fallback when no LSP client started");
});

test("Format Selection only changes the selected lines", () => {
  const { providers } = project({});
  const src = "<div>\n<p>a</p>\n<p>b</p>\n<p>c</p>\n</div>";
  const doc = document("/p/" + VIEW, src);
  const range = new (require("./mock-vscode").Range)(new Position(1, 0), new Position(2, 3));
  const out = apply(src, providers.rangeFormatting.provideDocumentRangeFormattingEdits(doc, range, { tabSize: 4, insertSpaces: true }));
  assert.equal(out, "<div>\n    <p>a</p>\n    <p>b</p>\n<p>c</p>\n</div>");
});

test("typing: Enter indents the new line, and the line just finished is corrected", async () => {
  const { handlers, applied, vscode } = project({});
  const text = "<div>\n<?php if ($a): ?>\n";
  const doc = { ...document("/p/" + VIEW, text), getText: () => text };
  handlers.change({ document: doc, contentChanges: [{ text: "\n", rangeLength: 0, range: new (require("./mock-vscode").Range)(new Position(1, 23), new Position(1, 23)) }] });
  await new Promise((r) => setImmediate(r));
  assert.equal(applied.length, 1);
  const wanted = applied[0].edits.map((e) => [e.range.start.line, e.text]);
  assert.deepEqual(wanted, [[2, "        "], [1, "    "]], "new line two levels in; the <?php if line itself one level in");
});

test("typing: a line that becomes </div>, <?php endif ?> or @endif moves back by itself; ordinary typing is left alone", async () => {
  const { handlers, applied } = project({});
  const text = "<div>\n    <p>\n        x\n        </p>";
  const doc = { ...document("/p/" + VIEW, text), getText: () => text };
  const R = require("./mock-vscode").Range;
  handlers.change({ document: doc, contentChanges: [{ text: ">", rangeLength: 0, range: new R(new Position(3, 12), new Position(3, 12)) }] });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(applied.at(-1).edits.map((e) => e.text), ["    "]);
  const before = applied.length;
  handlers.change({ document: doc, contentChanges: [{ text: "x", rangeLength: 0, range: new R(new Position(2, 9), new Position(2, 9)) }] });
  assert.equal(applied.length, before, "typing a letter inside a normal line changes nothing");
  const off = project({}, { autoIndent: false });
  off.handlers.change({ document: doc, contentChanges: [{ text: ">", rangeLength: 0, range: new R(new Position(3, 12), new Position(3, 12)) }] });
  assert.equal(off.applied.length, 0, "the setting turns it off");
});

test("the missing-server notice shows once per workspace and is remembered across activations (globalState)", () => {
  const { vscode } = project({});
  assert.equal(vscode.messages.length, 1, "activate() shows the one-time notice when the language client can't start");
  assert.match(vscode.messages[0], /language server|cast-language-server/);

  // a second activation (e.g. a window reload) must not show it again - the whole point of globalState
  const vscode2 = require("./mock-vscode").create({ root: undefined });
  vscode2.globalState = vscode.globalState; // same persisted store, as a real VS Code window reload would have
  const original = require("node:module")._load;
  require("node:module")._load = function (request, ...rest) {
    return request === "vscode" ? vscode2 : original.call(this, request, ...rest);
  };
  delete require.cache[require.resolve("../extension")];
  const extension2 = require("../extension");
  require("node:module")._load = original;
  extension2.activate({ subscriptions: [], globalState: vscode2.globalState });

  assert.equal(vscode2.messages.length, 0, "already shown once; globalState remembers that across activations");
});

test("EmbeddedDiagnostics.refresh maps CSS/JS provider diagnostics onto the real document, tagged cast-css/cast-javascript", async () => {
  const { extension, vscode } = project({});
  const { Range: MockRange, Position: MockPosition } = require("./mock-vscode");
  const src = "before\n@css(\n  .a { color: red }\n)\nafter\n@js(\n  let x = 1\n)\nend";
  const doc = document("/p/" + VIEW, src);

  vscode.languages.getDiagnostics = async (uri) => {
    if (/\.css$/.test(uri.fsPath)) return [{ range: new MockRange(new MockPosition(2, 7), new MockPosition(2, 10)), message: "bad value", severity: 0 }];
    if (/\.js$/.test(uri.fsPath)) return [{ range: new MockRange(new MockPosition(6, 2), new MockPosition(6, 9)), message: "missing ;", severity: 1 }];
    return [];
  };

  const collection = vscode.languages.createDiagnosticCollection("cast-embedded");
  const embedded = new extension.EmbeddedDiagnostics(collection);
  await embedded.refresh(doc);

  const published = vscode.collections["cast-embedded"].get(doc.uri.fsPath);
  assert.equal(published.length, 2, "both the css and js block's provider diagnostics are published");
  assert.ok(published.some((d) => d.source === "cast-css" && d.message === "bad value"));
  assert.ok(published.some((d) => d.source === "cast-javascript" && d.message === "missing ;"));
});

test("EmbeddedDiagnostics.onVirtualDiagnosticsChanged re-runs refresh() once the CSS/JS provider's async computation actually finishes, not just at refresh() time", async () => {
  // vscode.languages.getDiagnostics reads whatever VS Code's built-in CSS/JS language features have already
  // computed - it does not trigger or wait for that computation, which runs on its own debounce after the virtual
  // document opens/changes. Reading it synchronously inside refresh() (the original Task 7 implementation) sees
  // nothing on the first call; the fix tracks which virtual uri belongs to which source document and re-runs
  // refresh() when languages.onDidChangeDiagnostics fires for a tracked uri (wired in activate(); this test calls
  // the handler directly, the same way that subscription does).
  const { extension, vscode } = project({});
  const { Range: MockRange, Position: MockPosition } = require("./mock-vscode");
  const src = "before\n@css(\n  .a { color: red }\n)\nafter";
  const doc = document("/p/" + VIEW, src);

  let ready = false;
  vscode.languages.getDiagnostics = async () =>
    ready ? [{ range: new MockRange(new MockPosition(2, 7), new MockPosition(2, 10)), message: "bad value", severity: 0 }] : [];

  const collection = vscode.languages.createDiagnosticCollection("cast-embedded");
  const embedded = new extension.EmbeddedDiagnostics(collection);
  await embedded.refresh(doc);
  assert.deepEqual(vscode.collections["cast-embedded"].get(doc.uri.fsPath), [], "nothing published yet - the provider hasn't computed anything");

  ready = true;
  const [vUriString] = [...embedded.virtualToSource.keys()];
  assert.ok(vUriString, "refresh() tracked the block's virtual uri against its source document");
  embedded.onVirtualDiagnosticsChanged({ toString: () => vUriString });
  await new Promise((r) => setImmediate(r));

  const published = vscode.collections["cast-embedded"].get(doc.uri.fsPath);
  assert.equal(published.length, 1, "republished once the provider's diagnostics became available, without a new explicit refresh() call from the caller");
  assert.equal(published[0].message, "bad value");
});

test("EmbeddedDiagnostics.refresh publishes nothing (and never throws) when the embedded bridge is unavailable", async () => {
  const vscode = require("./mock-vscode").create({ root: undefined });
  delete vscode.EventEmitter; // same guard activate() itself uses before wiring the embedded bridge
  const original = require("node:module")._load;
  require("node:module")._load = function (request, ...rest) {
    return request === "vscode" ? vscode : original.call(this, request, ...rest);
  };
  delete require.cache[require.resolve("../extension")];
  const extension = require("../extension");
  require("node:module")._load = original;
  extension.activate({ subscriptions: [], globalState: vscode.globalState });

  const collection = vscode.languages.createDiagnosticCollection("cast-embedded");
  const embedded = new extension.EmbeddedDiagnostics(collection);
  const src = "@css(\n  .a { color: red }\n)";
  await embedded.refresh(document("/p/" + VIEW, src));

  assert.deepEqual(vscode.collections["cast-embedded"].get("/p/" + VIEW), []);
});
