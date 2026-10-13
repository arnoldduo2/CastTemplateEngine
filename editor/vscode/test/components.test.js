"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { create, document, Position } = require("./mock-vscode");
const { contextAt, diagnose, nearest } = require("../lib/complete");
const { lookup, listComponents, findProp } = require("../lib/components");

const BUTTON = `<?php
/**
 * Button component
 * @var string|null $label The text to display on the button
 * @var string|null $type The button type (e.g., "button", "submit", "reset")
 * @var string|null $href The URL to link to
 * @var string|null $variant The button variant (e.g., "primary", "secondary", "ghost")
 * @var bool $block Full width
 * @var string $title Required heading
 */
$label ??= 'Button';
$variant ??= 'primary';
`;
const LIST_ITEM = `<?php
/**
 * @var string $right The right side
 * @slot left The left side
 */
`;

function project(files, settings = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cast-comp-"));
  const all = { "resources/views/components/btns/button.cast.php": BUTTON, "resources/views/components/list-item.cast.php": LIST_ITEM, "resources/views/components/plain.cast.php": "<div></div>", ...files };
  for (const [rel, content] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  const vscode = create({ root, settings });
  const original = Module._load;
  Module._load = function (request, ...rest) {
    return request === "vscode" ? vscode : original.call(this, request, ...rest);
  };
  for (const key of Object.keys(require.cache)) if (/editor[\\/]vscode[\\/](extension|lib)/.test(key)) delete require.cache[key];
  const extension = require("../extension");
  Module._load = original;
  extension.activate({ subscriptions: [] });
  const view = path.join(root, "resources/views/page.cast.php");
  return { root, vscode, extension, providers: vscode.providers, view, where: extension.locations(document(view, "")) };
}

/** The document for `text` where `|` marks the cursor. */
function at(p, text) {
  const offset = text.indexOf("|");
  const clean = text.replace("|", "");
  const doc = document(p.view, clean);
  return { doc, position: doc.positionAt(offset), offset, clean };
}

const labels = (items) => (items || []).map((i) => i.label);

test("contextAt: tag names, attribute names, values, slot names, and nowhere else", () => {
  const ctx = (s) => {
    const i = s.indexOf("|");
    return contextAt(s.replace("|", ""), i);
  };
  assert.deepEqual(pick(ctx("<Btns.But|")), { type: "tag", prefix: "Btns.But" });
  assert.deepEqual(pick(ctx("<Btns.Button |")), { type: "attribute", prefix: "" });
  assert.deepEqual(pick(ctx("<Btns.Button la|")), { type: "attribute", prefix: "la" });
  assert.deepEqual(pick(ctx("<Btns.Button label=|")), { type: "value", prefix: "", quoted: false });
  assert.deepEqual(pick(ctx('<Btns.Button variant="pri|"')), { type: "value", prefix: "pri", quoted: true });
  assert.deepEqual(pick(ctx('<Card><Slot name="|">')), { type: "slot", prefix: "" });
  assert.equal(ctx("<Card total={$a|} />"), null, "inside a { } expression: no suggestions");
  assert.equal(ctx("<div |"), null);
  assert.equal(ctx("<?php if ($a <B|"), null, "not in PHP code");
  assert.equal(ctx("<!-- <Card |"), null);
  assert.equal(ctx("<Card a=\"1\" />|"), null, "after the tag");

  function pick(c) {
    return c && { type: c.type, prefix: c.prefix, ...(c.quoted !== undefined ? { quoted: c.quoted } : {}) };
  }
});

test("attribute completion: documented props with types, required first, used ones left out", () => {
  const p = project({});
  const { doc, position } = at(p, '<Btns.Button label="x" |');
  const items = p.providers.completion.provideCompletionItems(doc, position);
  assert.deepEqual(labels(items), ["title", "block", "href", "type", "variant"].sort((a, b) => order(a) - order(b)));
  const title = items.find((i) => i.label === "title");
  assert.equal(title.detail, "string · required");
  assert.equal(title.sortText[0], "0", "required props come first");
  assert.equal(title.insertText.value, 'title="$1"');
  assert.equal(items.find((i) => i.label === "block").insertText.value, "block", "a bool is a bare attribute");
  assert.equal(items.find((i) => i.label === "variant").insertText.value, 'variant="${1|primary,secondary,ghost|}"');
  assert.match(items.find((i) => i.label === "variant").detail, /string\|null · default 'primary'/);
  assert.match(items.find((i) => i.label === "type").documentation.value, /The button type/);

  function order(name) {
    return items ? items.findIndex((i) => i.label === name) : 0;
  }
});

test("attribute completion honours cast.propCase and replaces the part already typed", () => {
  const p = project({ "resources/views/components/kpi.cast.php": "<?php\n/** @var bool $hasLabel Show it */\n/** @var string $maxItems How many */\n" }, { propCase: "kebab" });
  const { doc, position } = at(p, "<Kpi has|");
  const items = p.providers.completion.provideCompletionItems(doc, position);
  assert.deepEqual(labels(items), ["has-label", "max-items"]);
  assert.deepEqual([items[0].range.start.character, items[0].range.end.character], [5, 8], "the typed 'has' is replaced");
  const snake = project({ "resources/views/components/kpi.cast.php": "<?php\n/** @var string $maxItems How many */\n" }, { propCase: "snake" });
  const c2 = at(snake, "<Kpi |");
  assert.deepEqual(labels(snake.providers.completion.provideCompletionItems(c2.doc, c2.position)), ["max_items"]);
});

test("a prop written in another spelling counts as used", () => {
  const p = project({ "resources/views/components/kpi.cast.php": "<?php\n/** @var string $maxItems How many\n * @var string $title T */\n" });
  const { doc, position } = at(p, '<Kpi max-items="3" |');
  assert.deepEqual(labels(p.providers.completion.provideCompletionItems(doc, position)), ["title"]);
});

test("value completion: documented values inside quotes, quoted for a bare '=', true/false for booleans", () => {
  const p = project({});
  let c = at(p, '<Btns.Button variant="|"');
  assert.deepEqual(labels(p.providers.completion.provideCompletionItems(c.doc, c.position)), ["primary", "secondary", "ghost"]);
  c = at(p, "<Btns.Button type=|");
  const items = p.providers.completion.provideCompletionItems(c.doc, c.position);
  assert.deepEqual(items.map((i) => i.insertText), ['"button"', '"submit"', '"reset"']);
  c = at(p, "<Btns.Button block=|");
  assert.deepEqual(p.providers.completion.provideCompletionItems(c.doc, c.position).map((i) => i.insertText), ["{true}", "{false}"]);
  c = at(p, '<Btns.Button label="|"');
  assert.deepEqual(p.providers.completion.provideCompletionItems(c.doc, c.position), [], "free text: nothing to offer");
});

test("slot name completion uses the parent component's @slot tags", () => {
  const p = project({});
  const { doc, position } = at(p, '<ListItem right="x"><Slot name="|"></Slot></ListItem>');
  assert.deepEqual(labels(p.providers.completion.provideCompletionItems(doc, position)), ["left"]);
});

test("tag completion: every component file, dotted for sub-folders, with its required props as placeholders", () => {
  const p = project({});
  const { doc, position } = at(p, "<B|");
  const items = p.providers.completion.provideCompletionItems(doc, position);
  assert.deepEqual(labels(items), ["Btns.Button", "ListItem", "Plain"]);
  const button = items.find((i) => i.label === "Btns.Button");
  assert.equal(button.detail, "Button component");
  assert.equal(button.insertText.value, 'Btns.Button title="$1"');
  assert.equal(items.find((i) => i.label === "Plain").insertText.value, "Plain");
  assert.match(button.documentation.value, /\| `label` \| `string\\\|null`/);
  assert.deepEqual(listComponents(p.where.componentDirs).map((c) => c.tag), ["Btns.Button", "ListItem", "Plain"]);
});

test("hover on a tag shows the description, a props table, slots and the file; on a prop, that prop", () => {
  const p = project({});
  let c = at(p, "<Btns.Bu|tton label=\"x\" />");
  const tag = p.providers.componentHover.provideHover(c.doc, c.position);
  assert.match(tag.contents.value, /\*\*<Btns\.Button>\*\*/);
  assert.match(tag.contents.value, /Button component/);
  assert.match(tag.contents.value, /\| `variant` \| `string\\\|null` \| = 'primary' \| The button variant/);
  assert.match(tag.contents.value, /\| `title` \| `string` \| required \|/);
  assert.match(tag.contents.value, /button\.cast\.php/);

  c = at(p, '<Btns.Button vari|ant="ghost" />');
  const prop = p.providers.componentHover.provideHover(c.doc, c.position);
  assert.match(prop.contents.value, /\*\*variant\*\*: `string\|null` — default `'primary'`/);
  assert.match(prop.contents.value, /One of: `primary`, `secondary`, `ghost`/);

  const li = at(p, "<ListI|tem right=\"r\" />");
  assert.match(p.providers.componentHover.provideHover(li.doc, li.position).contents.value, /Slots: `left` \(The left side\)/);
  c = at(p, "<Missing.Thing| />");
  assert.equal(p.providers.componentHover.provideHover(c.doc, c.position), undefined, "unknown components fall back to the file hover");
});

test("go to definition on a prop name jumps to the line that documents it", () => {
  const p = project({});
  const { doc, position } = at(p, '<Btns.Button variant|="ghost" />');
  const hit = p.providers.propDefinition.provideDefinition(doc, position);
  assert.match(hit.uri.fsPath, /button\.cast\.php$/);
  assert.equal(hit.position.line, BUTTON.split("\n").findIndex((l) => l.includes("$variant The button variant")));
});

test("diagnose: unknown prop (with a suggestion), missing required, value outside the list, deprecated", () => {
  const p = project({ "resources/views/components/old.cast.php": "<?php\n/** Old.\n * @deprecated Use New\n * @var string $a A\n * @var string $b B [optional] @deprecated gone */\n" });
  const find = (tag) => lookup(tag, p.where);
  const run = (src) => diagnose(src, find);

  let d = run('<Btns.Button titel="x" />');
  assert.deepEqual(d.map((x) => x.kind), ["unknown", "missing"], "the misspelt prop does not satisfy the required one");
  assert.match(d[0].message, /Did you mean "title"\?/);
  assert.equal(d[0].suggestion, "title");
  assert.equal(d[0].prop, "titel");

  d = run('<Btns.Button label="x" />');
  assert.deepEqual(d.map((x) => [x.kind, x.missing]), [["missing", ["title"]]]);
  assert.equal(d[0].insertAt, "<Btns.Button".length, "inserted right after the tag name");

  d = run('<Btns.Button title="t" variant="huge" />');
  assert.deepEqual(d.map((x) => [x.kind, x.prop]), [["value", "variant"]]);
  assert.match(d[0].message, /"huge" is not one of "primary", "secondary", "ghost"/);

  assert.deepEqual(run('<Btns.Button title="t" variant="<?= $v ?>" has-nothing={1} />').map((x) => x.kind), ["unknown"], "a PHP value is not checked");
  assert.deepEqual(run('<Btns.Button title={$t} {...$rest} />'), [], "a spread may supply anything");
  assert.deepEqual(run('<ListItem right="r"><Slot name="left">x</Slot></ListItem>'), [], "a slot is a prop too");
  assert.deepEqual(run("<Plain anything=\"goes\" />"), [], "a component with no documented props is never flagged");
  assert.deepEqual(run("<Unknown.Thing a=\"1\" />"), [], "an unresolved component is left alone");

  d = run('<Old a="1" b="2" />');
  assert.deepEqual(d.map((x) => x.kind).sort(), ["deprecated", "deprecated-prop"]);

  assert.deepEqual(run('<Btns.Button title="t" has-label />').map((x) => x.kind), ["unknown"], "has-label is not a prop of Button");
  assert.deepEqual(run('<Btns.Button title="t" block />'), [], "bare bool prop");
});

test("diagnose: a required prop supplied by a <Slot> counts", () => {
  const p = project({ "resources/views/components/card2.cast.php": "<?php\n/** @var string $header Head */\n" });
  assert.deepEqual(diagnose('<Card2><Slot name="header">H</Slot></Card2>', (t) => lookup(t, p.where)), []);
  assert.deepEqual(diagnose("<Card2 />", (t) => lookup(t, p.where)).map((x) => x.kind), ["missing"]);
});

test("nearest: edit distance and spelling variants", () => {
  assert.equal(nearest("titel", ["title", "label"]), "title");
  assert.equal(nearest("has-label", ["hasLabel"]), "hasLabel");
  assert.equal(nearest("zzzzz", ["title"]), null);
});

test("diagnostics are published for .cast.php files with the setting's severity, and off turns them off", async () => {
  const source = '<Btns.Button titel="x" />';
  let p = project({});
  const doc = document(p.view, source);
  p.extension.publishDiagnostics(doc, { set: (uri, list) => (p.out = list) });
  assert.equal(p.out.length, 2, "unknown titel + missing title");
  assert.equal(p.out[0].severity, 3, "hint by default");
  assert.equal(p.out[0].source, "cast");

  p = project({}, { diagnostics: "warning" });
  p.extension.publishDiagnostics(document(p.view, source), { set: (uri, list) => (p.out = list) });
  assert.equal(p.out[0].severity, 1);

  p = project({}, { diagnostics: "off" });
  p.extension.publishDiagnostics(document(p.view, source), { set: (uri, list) => (p.out = list) });
  assert.deepEqual(p.out, []);
});

test("quick fixes: add the missing props, fix a misspelt one, pick an allowed value", () => {
  const p = project({});
  const source = '<Btns.Button titel="x" variant="huge" />';
  const doc = document(p.view, source);
  let collected;
  p.extension.publishDiagnostics(doc, { set: (uri, list) => (collected = list) });
  const actions = p.providers.codeActions.provideCodeActions(doc, null, { diagnostics: collected });
  const titles = actions.map((a) => a.title);
  assert.ok(titles.includes('Change to "title"'));
  assert.ok(titles.includes('Add "title"'));
  assert.ok(titles.includes('Use "primary"') && titles.includes('Use "ghost"'));

  const add = actions.find((a) => a.title === 'Add "title"');
  assert.equal(add.edit.edits[0].text, ' title=""');
  assert.equal(add.edit.edits[0].position.character, "<Btns.Button".length);
  const fix = actions.find((a) => a.title === 'Change to "title"');
  assert.equal(fix.edit.edits[0].text, "title");
  assert.equal(fix.kind, "quickfix");
});

test("lookup and findProp use the engine's spelling rules", () => {
  const p = project({});
  const found = lookup("Btns.Button", p.where);
  assert.ok(found.file.endsWith("button.cast.php"));
  assert.equal(findProp(found.spec, "has-nothing"), null);
  assert.equal(findProp(found.spec, "VARIANT"), null, "names are case sensitive apart from the dash and underscore styles");
  assert.equal(lookup("No.Such", p.where), null);
});
