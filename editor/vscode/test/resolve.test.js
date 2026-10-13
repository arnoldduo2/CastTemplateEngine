"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { variants, resolveComponent, resolveLegacyComponent, resolveView, resolveModule, propsOf } = require("../lib/resolve");

/** A fake file system: a set of file paths; folders are implied. */
function fakeFs(...files) {
  const set = new Set(files.map((f) => path.normalize(f)));
  const dirs = new Set();
  for (const f of set) for (let d = path.dirname(f); d !== path.dirname(d); d = path.dirname(d)) dirs.add(d);
  return { isFile: (p) => set.has(path.normalize(p)), isDir: (p) => dirs.has(path.normalize(p)) };
}
const C = "/app/resources/views/components";

test("the four spellings, in the engine's order", () => {
  assert.deepEqual(variants("KpiCard"), ["kpi-card", "kpi_card", "KpiCard", "kpiCard"]);
  assert.deepEqual(variants("Badge"), ["badge", "Badge"]);
  assert.deepEqual(variants("Form2Field"), ["form2-field", "form2_field", "Form2Field", "form2Field"]);
  assert.deepEqual(variants("HTMLBox"), ["htmlbox", "HTMLBox", "hTMLBox"]);
});

test("a component resolves to the first spelling that exists", () => {
  for (const file of ["kpi-card", "kpi_card", "KpiCard", "kpiCard"]) {
    const r = resolveComponent("KpiCard", [C], ".cast.php", fakeFs(`${C}/${file}.cast.php`));
    assert.equal(r.file, path.normalize(`${C}/${file}.cast.php`), file);
  }
  const both = resolveComponent("KpiCard", [C], ".cast.php", fakeFs(`${C}/KpiCard.cast.php`, `${C}/kpi-card.cast.php`));
  assert.equal(both.file, path.normalize(`${C}/kpi-card.cast.php`), "kebab-case comes first");
});

test("dotted names are folders, matched in the same four styles", () => {
  const fs = fakeFs(`${C}/btns/add-new.cast.php`, `${C}/Form/TextInput.cast.php`, `${C}/mobile/cards/card.cast.php`);
  assert.equal(resolveComponent("Btns.AddNew", [C], ".cast.php", fs).file, path.normalize(`${C}/btns/add-new.cast.php`));
  assert.equal(resolveComponent("Form.TextInput", [C], ".cast.php", fs).file, path.normalize(`${C}/Form/TextInput.cast.php`), "folder spelled Form");
  assert.equal(resolveComponent("Mobile.Cards.Card", [C], ".cast.php", fs).file, path.normalize(`${C}/mobile/cards/card.cast.php`));
});

test("a missing component lists what was tried", () => {
  const r = resolveComponent("Btns.Nope", [C], ".cast.php", fakeFs(`${C}/btns/other.cast.php`));
  assert.equal(r.file, null);
  assert.ok(r.tried.includes(path.normalize(`${C}/btns/nope.cast.php`)));
  assert.equal(resolveComponent("Missing.Thing", [C], ".cast.php", fakeFs()).file, null);
});

test("several component folders are searched in order", () => {
  const ui = "/app/resources/views/ui";
  const fs = fakeFs(`${ui}/card.cast.php`, `${C}/card.cast.php`);
  assert.equal(resolveComponent("Card", [ui, C], ".cast.php", fs).file, path.normalize(`${ui}/card.cast.php`));
  assert.equal(resolveComponent("Card", [C, ui], ".cast.php", fs).file, path.normalize(`${C}/card.cast.php`));
  assert.equal(resolveComponent("OnlyUi", [C, ui], ".cast.php", fakeFs(`${ui}/only-ui.cast.php`)).file, path.normalize(`${ui}/only-ui.cast.php`));
});

test("a different extension", () => {
  assert.equal(resolveComponent("Card", [C], ".tpl.php", fakeFs(`${C}/card.tpl.php`)).file, path.normalize(`${C}/card.tpl.php`));
  assert.equal(resolveComponent("Card", [C], ".cast.php", fakeFs(`${C}/card.tpl.php`)).file, null);
});

test("legacy Component() names are used as written; .cast.php before plain .php", () => {
  const fs = fakeFs(`${C}/btns/add-new.php`, `${C}/attrs/item.cast.php`, `${C}/attrs/item.php`);
  assert.equal(resolveLegacyComponent("btns.add-new", [C], ".cast.php", fs).file, path.normalize(`${C}/btns/add-new.php`));
  assert.equal(resolveLegacyComponent("attrs.item", [C], ".cast.php", fs).file, path.normalize(`${C}/attrs/item.cast.php`));
  assert.equal(resolveLegacyComponent("btns.addNew", [C], ".cast.php", fs).file, null, "no spelling variants for the legacy helper");
});

test("view names: dots or slashes are folders; .cast.php then .php", () => {
  const V = "/app/resources/views";
  const fs = fakeFs(`${V}/layouts/header.cast.php`, `${V}/items/partials/items.cast.php`, `${V}/errors/500.php`);
  assert.equal(resolveView("layouts.header", V, ".cast.php", fs).file, path.normalize(`${V}/layouts/header.cast.php`));
  assert.equal(resolveView("items/partials/items", V, ".cast.php", fs).file, path.normalize(`${V}/items/partials/items.cast.php`));
  assert.equal(resolveView("errors.500", V, ".cast.php", fs).file, path.normalize(`${V}/errors/500.php`));
  assert.equal(resolveView("nope.nope", V, ".cast.php", fs).file, null);
});

test("modules: js and css files under resources", () => {
  const R = "/app/resources";
  const fs = fakeFs(`${R}/js/items/items.module.js`, `${R}/css/items/items.css`, `${R}/css/app.css`, `${R}/js/app/app.module.js`);
  assert.equal(resolveModule("items.items", "js", R, fs).file, path.normalize(`${R}/js/items/items.module.js`));
  assert.equal(resolveModule("items.items", "css", R, fs).file, path.normalize(`${R}/css/items/items.css`));
  assert.equal(resolveModule("app", "css", R, fs).file, path.normalize(`${R}/css/app.css`));
  assert.equal(resolveModule("app.app", "js", R, fs).file, path.normalize(`${R}/js/app/app.module.js`));
  assert.equal(resolveModule("nope", "js", R, fs).file, null);
});

test("props are read from ??= defaults and @var / @param docblocks", () => {
  const source = `<?php
/** @var string $title the heading
 * @param bool $hasLabel */
$label ??= 'Input';
$type ??= 'text';
echo $children; $data['x'];
$this->x ??= 1;`;
  assert.deepEqual(propsOf(source).sort(), ["hasLabel", "label", "title", "type"]);
});
