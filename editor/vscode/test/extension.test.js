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
  extension.activate({ subscriptions: [] });
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
