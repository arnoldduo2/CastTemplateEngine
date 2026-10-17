import assert from 'node:assert/strict';
import test from 'node:test';
import { scanHelpers, scanChainCalls } from '../index.js';

const at = (src: string, ref: { start: number; end: number }) => src.slice(ref.start, ref.end);

test('helper calls: views, includes, legacy components and modules, with the range inside the quotes', () => {
  const src = [
    `<?php __includes('layouts.header', $data); ?>`,
    `<?php views("items.items", $d); $this->view('home.home'); ?>`,
    `<?= Component('btns.add-new', ['link' => 'x']) ?>`,
    `<?= __modules('app', 'css') ?><?= __modules('app.app', 'js') ?><?= __modules('only.name') ?>`,
    `<?= __modules("$parentName.$pageName", 'js') ?>`,
  ].join('\n');
  const refs = scanHelpers(src);
  assert.deepEqual(
    refs.map((r) => [r.kind, at(src, r), r.type]),
    [
      ['view', 'layouts.header', undefined],
      ['view', 'items.items', undefined],
      ['view', 'home.home', undefined],
      ['legacy-component', 'btns.add-new', undefined],
      ['module', 'app', 'css'],
      ['module', 'app.app', 'js'],
      ['module', 'only.name', 'js'],
    ]
  );
});

test('helper scanning ignores look-alikes', () => {
  assert.deepEqual(scanHelpers(`<?php $x->preview('a.b'); myviews('a.b'); __includes($name); Component($c); ?>`), []);
});

test('fluent chain scanning: every .filter/.map segment, range covers the method name only', () => {
  const src = '@$items.filter(($i) => $i->active).map(($i, $k) => $i->name)';
  const found = scanChainCalls(src);
  assert.deepEqual(
    found.map((c) => [c.method, src.slice(c.start, c.end)]),
    [
      ['filter', 'filter'],
      ['map', 'map'],
    ]
  );
});

test('fluent chain scanning: the leading $ is optional, and a single segment is enough', () => {
  assert.deepEqual(scanChainCalls('@items.map(($i) => $i)').map((c) => c.method), ['map']);
  assert.deepEqual(scanChainCalls('@$list.filter(($i) => true)').map((c) => c.method), ['filter']);
});

test('fluent chain scanning: the plain @map(...)/@filter(...) directive form is not a chain', () => {
  assert.deepEqual(scanChainCalls('@map($items, ($i) => $i)'), []);
  assert.deepEqual(scanChainCalls('@filter($items, ($i) => true)'), []);
});

test('fluent chain scanning never looks inside <?php ?>, <script> or <style>', () => {
  assert.deepEqual(scanChainCalls('<?php $x = 1; @$items.filter(($i) => $i); ?>'), []);
  assert.deepEqual(scanChainCalls('<script>// @$items.filter(x).map(y)</script>'), []);
  assert.deepEqual(scanChainCalls('<style>/* @$items.filter(x).map(y) */</style>'), []);
});

test('fluent chain scanning: nested parentheses and strings inside a segment do not end it early', () => {
  const src = "@$items.filter(($i) => in_array($i, ['a)', 'b'])).map(($i) => $i)";
  const found = scanChainCalls(src);
  assert.deepEqual(found.map((c) => c.method), ['filter', 'map']);
  assert.equal(src.slice(found[1].start, found[1].end), 'map');
});
