"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { tokenize, find, available } = require("./tokenize");

const skip = available() ? false : "run `node test/fetch-grammars.js` first (downloads VS Code's PHP/HTML grammars)";
const has = (scopeLists, scope) => scopeLists.some((scopes) => scopes.includes(scope));

test("component tags: brackets, names and the dotted separator", { skip }, async () => {
  const t = await tokenize("<Card>x</Card><Btns.Button />");
  assert.ok(has(find(t, "Card"), "entity.name.tag.component.cast"));
  assert.ok(has(find(t, "Card"), "support.class.component.cast"));
  assert.equal(find(t, "Card").length, 2, "opening and closing");
  assert.ok(has(find(t, "Btns"), "entity.name.tag.component.cast"));
  assert.ok(has(find(t, "."), "punctuation.separator.namespace.cast"));
  assert.ok(has(find(t, "Button"), "entity.name.tag.component.cast"));
  assert.ok(has(find(t, "/>"), "punctuation.definition.tag.end.cast"));
  assert.ok(has(find(t, "</"), "punctuation.definition.tag.begin.cast"));
});

test("props: names, strings with embedded PHP, brace expressions with PHP, spread, bare attributes", { skip }, async () => {
  const t = await tokenize(`<Card title="Hi <?= $n ?>" total={$p['qty'] + 1} {...$data} required />`);
  assert.ok(has(find(t, "title"), "entity.other.attribute-name.cast"));
  assert.ok(has(find(t, "required"), "entity.other.attribute-name.cast"));
  assert.ok(has(find(t, "Hi"), "string.quoted.double.cast"));
  assert.ok(has(find(t, "n"), "meta.embedded.line.php"), "PHP inside a string prop");
  assert.ok(has(find(t, "qty"), "meta.embedded.expression.cast"), "PHP inside braces");
  assert.ok(has(find(t, "qty"), "string.quoted.single.php"));
  assert.ok(has(find(t, "..."), "keyword.operator.spread.cast"));
  assert.ok(has(find(t, "data"), "variable.other.php"));
});

test("<Slot> is its own kind of tag", { skip }, async () => {
  const t = await tokenize('<Card><Slot name="left">x</Slot></Card>');
  assert.equal(find(t, "Slot").length, 2);
  assert.ok(find(t, "Slot").every((s) => s.includes("entity.name.tag.slot.cast")));
});

test("components inside brace values: on plain HTML tags, nested, in a ternary, after a closure", { skip }, async () => {
  const html = await tokenize("<div data-html={<Attributes.BadgeItem left={$n} />}>t</div>");
  assert.ok(has(find(html, "BadgeItem"), "entity.name.tag.component.cast"));
  assert.ok(has(find(html, "BadgeItem"), "meta.attribute.expression.cast"));
  assert.ok(has(find(html, "div"), "entity.name.tag.html"), "the host tag is still HTML");

  const tern = await tokenize("<Card total={$ok ? <Yes /> : <No />} fn={function() { return 1; }} after=\"x\" />");
  assert.ok(has(find(tern, "Yes"), "entity.name.tag.component.cast"));
  assert.ok(has(find(tern, "No"), "entity.name.tag.component.cast"));
  assert.ok(has(find(tern, "after"), "entity.other.attribute-name.cast"), "the closure's braces did not end the value early");
});

test("what is not a component stays what the HTML/PHP grammars say", { skip }, async () => {
  const t = await tokenize(['<div class="a"><span>text < B</span></div>', "<?php if ($a < B) { echo '<Card />'; } ?>", "<!-- <Card /> -->", "<script>if (a<B) { var s = '<Card />'; }</script>", '<p title="<Card />">q</p>'].join("\n"));
  assert.equal(t.filter((x) => x.scopes.includes("entity.name.tag.component.cast")).length, 0, "no component scope anywhere above");
  assert.ok(has(find(t, "div"), "entity.name.tag.html"));
  assert.ok(has(find(t, "span"), "entity.name.tag.html"));
});

test("a view that mixes PHP blocks and components keeps both highlighted", { skip }, async () => {
  const t = await tokenize(['<?php $items = [1, 2]; ?>', '<Card title="List">', '<?php foreach ($items as $i) : ?>', '  <Btns.Button label={"n-$i"} />', '<?php endforeach ?>', '</Card>'].join("\n"));
  assert.ok(has(find(t, "foreach"), "keyword.control.foreach.php"));
  assert.ok(has(find(t, "Button"), "entity.name.tag.component.cast"));
  assert.ok(has(find(t, "endforeach"), "keyword.control.endforeach.php") || has(find(t, "endforeach"), "meta.embedded.line.php"));
  assert.equal(find(t, "Card").length, 2);
});

test("without the injection grammar the same source has no component scopes (the test is meaningful)", { skip }, async () => {
  const t = await tokenize("<Card total={$x} />", { cast: false });
  assert.equal(t.filter((x) => x.scopes.some((s) => s.endsWith(".cast"))).length, 0);
});

test("the grammar files are valid JSON with the expected scope", () => {
  const g = require("../syntaxes/cast-injection.tmLanguage.json");
  assert.equal(g.scopeName, "cast.injection");
  assert.ok(g.injectionSelector.includes("text.html.php"));
  const pkg = require("../package.json");
  assert.equal(pkg.contributes.grammars[0].scopeName, g.scopeName);
  assert.deepEqual(pkg.contributes.grammars[0].injectTo, ["text.html.php"]);
  const fs = require("node:fs");
  const path = require("node:path");
  for (const s of pkg.contributes.snippets) {
    const snippets = JSON.parse(fs.readFileSync(path.join(__dirname, "..", s.path), "utf8"));
    assert.ok(Object.keys(snippets).length > 0, s.path);
    for (const [name, snippet] of Object.entries(snippets)) assert.ok(snippet.prefix && snippet.body, name);
  }
});

test("@ directives: keyword, PHP in the parentheses, the optional colon, nested parentheses", { skip }, async () => {
  const t = await tokenize("@foreach ($users as $user):\n  <p>@{ $user->name }</p>\n@endforeach\n@if (in_array($a, [1, (2 + 3)])) x @elseif ($b) y @else z @endif");
  assert.ok(has(find(t, "foreach"), "keyword.control.directive.cast"));
  assert.ok(has(find(t, "endforeach"), "keyword.control.directive.cast"));
  assert.ok(has(find(t, "elseif"), "keyword.control.directive.cast"));
  assert.ok(has(find(t, "else"), "keyword.control.directive.cast"));
  assert.ok(has(find(t, "endif"), "keyword.control.directive.cast"));
  assert.ok(has(find(t, "@"), "punctuation.definition.directive.cast"));
  assert.ok(has(find(t, "users"), "meta.embedded.expression.cast"), "PHP inside the parentheses");
  assert.ok(has(find(t, "in_array"), "meta.embedded.expression.cast"));
  assert.ok(has(find(t, ":"), "punctuation.separator.directive.cast"), "the colon");
  assert.ok(find(t, "x").every((s) => !s.includes("meta.directive.cast")), "text after the closing parenthesis is plain again");
  assert.ok(find(t, "y").every((s) => !s.includes("meta.directive.cast")));
});

test("@{ } is PHP, also inside attribute values and in a component prop string", { skip }, async () => {
  const t = await tokenize('<p>@{ $a["k"] + 1 }</p><a href="/u/@{ $id }" class="x">l</a><Card title="Hi @{ $n }" />');
  assert.ok(has(find(t, "a"), "meta.directive.echo.cast"));
  assert.ok(has(find(t, "a"), "meta.embedded.expression.cast"));
  assert.ok(has(find(t, "id"), "meta.directive.echo.cast"), "inside an href");
  assert.ok(has(find(t, "n"), "meta.directive.echo.cast"), "inside a component string prop");
  assert.ok(has(find(t, "Card"), "entity.name.tag.component.cast"));
});

test("@ that is not a directive: e-mail addresses, CSS rules, @@, unknown words, PHP blocks", { skip }, async () => {
  const t = await tokenize(['me@example.com and hello@for.com', '<style>@media (min-width: 1px) { a { color: red } }</style>', '@import @unknown @@for', "<?php echo '@foreach (x)'; ?>"].join("\n"));
  assert.equal(t.filter((x) => x.scopes.includes("keyword.control.directive.cast")).length, 0, "no directive anywhere above");
  assert.ok(has(find(t, "@@"), "constant.character.escape.directive.cast"));
});

test("a directive next to a component and PHP in the same view", { skip }, async () => {
  const t = await tokenize(['<Card title="List">', '@forelse ($items as $i):', '  <Btns.Button label={"n-$i"} />', '@empty', '  <?php echo 1; ?>', '@endforelse', '</Card>'].join("\n"));
  assert.ok(has(find(t, "forelse"), "keyword.control.directive.cast"));
  assert.ok(has(find(t, "empty"), "keyword.control.directive.cast"));
  assert.ok(has(find(t, "Button"), "entity.name.tag.component.cast"));
  assert.equal(find(t, "Card").length, 2);
});
