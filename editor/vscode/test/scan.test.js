"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { scanComponents, scanHelpers } = require("../lib/scan");

const names = (src) => scanComponents(src).map((c) => (c.closing ? "/" : "") + c.name);
const at = (src, ref) => src.slice(ref.start, ref.end);

test("finds opening, closing and self-closing component tags, with the range of the name only", () => {
  const src = '<Card title="x"><Btns.Button /></Card>';
  const refs = scanComponents(src);
  assert.deepEqual(names(src), ["Card", "Btns.Button", "/Card"]);
  assert.deepEqual(refs.map((r) => at(src, r)), ["Card", "Btns.Button", "Card"]);
});

test("a component inside a { } attribute value, also on plain HTML tags and when nested", () => {
  const src = '<div data-html={<Attributes.BadgeItem left={<Icon name="a" />} />} class="x"><Panel total={$ok ? <Yes /> : <No />} /></div>';
  assert.deepEqual(names(src), ["Attributes.BadgeItem", "Icon", "Panel", "Yes", "No"]);
});

test("lowercase tags, text and comparisons are not components", () => {
  assert.deepEqual(names("<div><span>a < B and c > D</span><p>x</p></div>"), []);
  assert.deepEqual(names("<Card/ ><Card>"), ["Card", "Card"], "a name may be followed by space, / or >");
  assert.deepEqual(names("<Card.><Card_x />"), ["Card_x"], "a dot must be followed by another capitalised name");
  assert.deepEqual(names("<Card2 />"), ["Card2"]);
  assert.deepEqual(names("<2Card />"), []);
});

test("never looks inside <?php ?>, <?= ?>, comments, <script> and <style>", () => {
  const src = [
    "<?php if ($a < B) { echo '<Hidden />'; } ?>",
    "<?= '<AlsoHidden />' ?>",
    "<!-- <Commented /> -->",
    "<script>if (a<B) { x = '<InJs />'; }</script>",
    "<style>.a > B { }</style>",
    "<Shown />",
  ].join("\n");
  assert.deepEqual(names(src), ["Shown"]);
});

test("quoted attribute values are skipped, including PHP inside them", () => {
  const src = `<Card title="<Fake />" label='<AlsoFake />' alt="<?= $a["x"] ?>" /><Real />`;
  assert.deepEqual(names(src), ["Card", "Real"]);
});

test("strings inside { } do not confuse the brace matching", () => {
  const src = `<Card a={"}{ <Nope />"} b={'}'} c={ [1, 2, fn() => { return 1; }] } /><After />`;
  assert.deepEqual(names(src), ["Card", "After"]);
});

test("an unterminated tag or expression does not hang or throw", () => {
  for (const src of ["<Card title=", "<Card a={<B", "<Card a={", "<?php", "<!-- ", "<script>", '<Card a="', "<", "<Card", "</Card"]) {
    assert.doesNotThrow(() => scanComponents(src), src);
  }
});

test("the Slot tag is reported like a component (the extension skips it)", () => {
  assert.deepEqual(names('<Card><Slot name="left">x</Slot></Card>'), ["Card", "Slot", "/Slot", "/Card"]);
});

test("positions are correct on later lines", () => {
  const src = "<div>\n  <Card>\n    <Btns.Button />\n  </Card>\n</div>";
  const refs = scanComponents(src);
  assert.deepEqual(refs.map((r) => at(src, r)), ["Card", "Btns.Button", "Card"]);
});

test("helper calls: views, includes, legacy components and modules, with the range inside the quotes", () => {
  const src = [
    `<?php __includes('layouts.header', $data); ?>`,
    `<?php views("items.items", $d); $this->view('home.home'); ?>`,
    `<?= Component('btns.add-new', ['link' => 'x']) ?>`,
    `<?= __modules('app', 'css') ?><?= __modules('app.app', 'js') ?><?= __modules('only.name') ?>`,
    `<?= __modules("$parentName.$pageName", 'js') ?>`,
  ].join("\n");
  const refs = scanHelpers(src);
  assert.deepEqual(refs.map((r) => [r.kind, at(src, r), r.type]), [
    ["view", "layouts.header", undefined],
    ["view", "items.items", undefined],
    ["view", "home.home", undefined],
    ["legacy-component", "btns.add-new", undefined],
    ["module", "app", "css"],
    ["module", "app.app", "js"],
    ["module", "only.name", "js"],
  ]);
});

test("helper scanning ignores look-alikes", () => {
  assert.deepEqual(scanHelpers(`<?php $x->preview('a.b'); myviews('a.b'); __includes($name); Component($c); ?>`), []);
});
