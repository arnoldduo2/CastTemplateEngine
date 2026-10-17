"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const index_js_1 = require("../index.js");
const at = (src, ref) => src.slice(ref.start, ref.end);
(0, node_test_1.default)('helper calls: views, includes, legacy components and modules, with the range inside the quotes', () => {
    const src = [
        `<?php __includes('layouts.header', $data); ?>`,
        `<?php views("items.items", $d); $this->view('home.home'); ?>`,
        `<?= Component('btns.add-new', ['link' => 'x']) ?>`,
        `<?= __modules('app', 'css') ?><?= __modules('app.app', 'js') ?><?= __modules('only.name') ?>`,
        `<?= __modules("$parentName.$pageName", 'js') ?>`,
    ].join('\n');
    const refs = (0, index_js_1.scanHelpers)(src);
    strict_1.default.deepEqual(refs.map((r) => [r.kind, at(src, r), r.type]), [
        ['view', 'layouts.header', undefined],
        ['view', 'items.items', undefined],
        ['view', 'home.home', undefined],
        ['legacy-component', 'btns.add-new', undefined],
        ['module', 'app', 'css'],
        ['module', 'app.app', 'js'],
        ['module', 'only.name', 'js'],
    ]);
});
(0, node_test_1.default)('helper scanning ignores look-alikes', () => {
    strict_1.default.deepEqual((0, index_js_1.scanHelpers)(`<?php $x->preview('a.b'); myviews('a.b'); __includes($name); Component($c); ?>`), []);
});
(0, node_test_1.default)('fluent chain scanning: every .filter/.map segment, range covers the method name only', () => {
    const src = '@$items.filter(($i) => $i->active).map(($i, $k) => $i->name)';
    const found = (0, index_js_1.scanChainCalls)(src);
    strict_1.default.deepEqual(found.map((c) => [c.method, src.slice(c.start, c.end)]), [
        ['filter', 'filter'],
        ['map', 'map'],
    ]);
});
(0, node_test_1.default)('fluent chain scanning: the leading $ is optional, and a single segment is enough', () => {
    strict_1.default.deepEqual((0, index_js_1.scanChainCalls)('@items.map(($i) => $i)').map((c) => c.method), ['map']);
    strict_1.default.deepEqual((0, index_js_1.scanChainCalls)('@$list.filter(($i) => true)').map((c) => c.method), ['filter']);
});
(0, node_test_1.default)('fluent chain scanning: the plain @map(...)/@filter(...) directive form is not a chain', () => {
    strict_1.default.deepEqual((0, index_js_1.scanChainCalls)('@map($items, ($i) => $i)'), []);
    strict_1.default.deepEqual((0, index_js_1.scanChainCalls)('@filter($items, ($i) => true)'), []);
});
(0, node_test_1.default)('fluent chain scanning never looks inside <?php ?>, <script> or <style>', () => {
    strict_1.default.deepEqual((0, index_js_1.scanChainCalls)('<?php $x = 1; @$items.filter(($i) => $i); ?>'), []);
    strict_1.default.deepEqual((0, index_js_1.scanChainCalls)('<script>// @$items.filter(x).map(y)</script>'), []);
    strict_1.default.deepEqual((0, index_js_1.scanChainCalls)('<style>/* @$items.filter(x).map(y) */</style>'), []);
});
(0, node_test_1.default)('fluent chain scanning: nested parentheses and strings inside a segment do not end it early', () => {
    const src = "@$items.filter(($i) => in_array($i, ['a)', 'b'])).map(($i) => $i)";
    const found = (0, index_js_1.scanChainCalls)(src);
    strict_1.default.deepEqual(found.map((c) => c.method), ['filter', 'map']);
    strict_1.default.equal(src.slice(found[1].start, found[1].end), 'map');
});
//# sourceMappingURL=scan.test.js.map