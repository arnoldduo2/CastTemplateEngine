"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const path = __importStar(require("node:path"));
const index_js_1 = require("../index.js");
/** A fake file system: a set of file paths; folders are implied. */
function fakeFs(...files) {
    const set = new Set(files.map((f) => path.normalize(f)));
    const dirs = new Set();
    for (const f of set)
        for (let d = path.dirname(f); d !== path.dirname(d); d = path.dirname(d))
            dirs.add(d);
    return { isFile: (p) => set.has(path.normalize(p)), isDir: (p) => dirs.has(path.normalize(p)) };
}
const C = '/app/resources/views/components';
(0, node_test_1.default)("the four spellings, in the engine's order", () => {
    strict_1.default.deepEqual((0, index_js_1.variants)('KpiCard'), ['kpi-card', 'kpi_card', 'KpiCard', 'kpiCard']);
    strict_1.default.deepEqual((0, index_js_1.variants)('Badge'), ['badge', 'Badge']);
    strict_1.default.deepEqual((0, index_js_1.variants)('Form2Field'), ['form2-field', 'form2_field', 'Form2Field', 'form2Field']);
    strict_1.default.deepEqual((0, index_js_1.variants)('HTMLBox'), ['htmlbox', 'HTMLBox', 'hTMLBox']);
});
(0, node_test_1.default)('a component resolves to the first spelling that exists', () => {
    for (const file of ['kpi-card', 'kpi_card', 'KpiCard', 'kpiCard']) {
        const r = (0, index_js_1.resolveComponent)('KpiCard', [C], '.cast.php', fakeFs(`${C}/${file}.cast.php`));
        strict_1.default.equal(r.file, path.normalize(`${C}/${file}.cast.php`), file);
    }
    const both = (0, index_js_1.resolveComponent)('KpiCard', [C], '.cast.php', fakeFs(`${C}/KpiCard.cast.php`, `${C}/kpi-card.cast.php`));
    strict_1.default.equal(both.file, path.normalize(`${C}/kpi-card.cast.php`), 'kebab-case comes first');
});
(0, node_test_1.default)('dotted names are folders, matched in the same four styles', () => {
    const fs = fakeFs(`${C}/btns/add-new.cast.php`, `${C}/Form/TextInput.cast.php`, `${C}/mobile/cards/card.cast.php`);
    strict_1.default.equal((0, index_js_1.resolveComponent)('Btns.AddNew', [C], '.cast.php', fs).file, path.normalize(`${C}/btns/add-new.cast.php`));
    strict_1.default.equal((0, index_js_1.resolveComponent)('Form.TextInput', [C], '.cast.php', fs).file, path.normalize(`${C}/Form/TextInput.cast.php`), 'folder spelled Form');
    strict_1.default.equal((0, index_js_1.resolveComponent)('Mobile.Cards.Card', [C], '.cast.php', fs).file, path.normalize(`${C}/mobile/cards/card.cast.php`));
});
(0, node_test_1.default)('a missing component lists what was tried', () => {
    const r = (0, index_js_1.resolveComponent)('Btns.Nope', [C], '.cast.php', fakeFs(`${C}/btns/other.cast.php`));
    strict_1.default.equal(r.file, null);
    strict_1.default.ok(r.tried.includes(path.normalize(`${C}/btns/nope.cast.php`)));
    strict_1.default.equal((0, index_js_1.resolveComponent)('Missing.Thing', [C], '.cast.php', fakeFs()).file, null);
});
(0, node_test_1.default)('several component folders are searched in order', () => {
    const ui = '/app/resources/views/ui';
    const fs = fakeFs(`${ui}/card.cast.php`, `${C}/card.cast.php`);
    strict_1.default.equal((0, index_js_1.resolveComponent)('Card', [ui, C], '.cast.php', fs).file, path.normalize(`${ui}/card.cast.php`));
    strict_1.default.equal((0, index_js_1.resolveComponent)('Card', [C, ui], '.cast.php', fs).file, path.normalize(`${C}/card.cast.php`));
    strict_1.default.equal((0, index_js_1.resolveComponent)('OnlyUi', [C, ui], '.cast.php', fakeFs(`${ui}/only-ui.cast.php`)).file, path.normalize(`${ui}/only-ui.cast.php`));
});
(0, node_test_1.default)('a different extension', () => {
    strict_1.default.equal((0, index_js_1.resolveComponent)('Card', [C], '.tpl.php', fakeFs(`${C}/card.tpl.php`)).file, path.normalize(`${C}/card.tpl.php`));
    strict_1.default.equal((0, index_js_1.resolveComponent)('Card', [C], '.cast.php', fakeFs(`${C}/card.tpl.php`)).file, null);
});
(0, node_test_1.default)('legacy Component() names are used as written; .cast.php before plain .php', () => {
    const fs = fakeFs(`${C}/btns/add-new.php`, `${C}/attrs/item.cast.php`, `${C}/attrs/item.php`);
    strict_1.default.equal((0, index_js_1.resolveLegacyComponent)('btns.add-new', [C], '.cast.php', fs).file, path.normalize(`${C}/btns/add-new.php`));
    strict_1.default.equal((0, index_js_1.resolveLegacyComponent)('attrs.item', [C], '.cast.php', fs).file, path.normalize(`${C}/attrs/item.cast.php`));
    strict_1.default.equal((0, index_js_1.resolveLegacyComponent)('btns.addNew', [C], '.cast.php', fs).file, null, 'no spelling variants for the legacy helper');
});
(0, node_test_1.default)('view names: dots or slashes are folders; .cast.php then .php', () => {
    const V = '/app/resources/views';
    const fs = fakeFs(`${V}/layouts/header.cast.php`, `${V}/items/partials/items.cast.php`, `${V}/errors/500.php`);
    strict_1.default.equal((0, index_js_1.resolveView)('layouts.header', V, '.cast.php', fs).file, path.normalize(`${V}/layouts/header.cast.php`));
    strict_1.default.equal((0, index_js_1.resolveView)('items/partials/items', V, '.cast.php', fs).file, path.normalize(`${V}/items/partials/items.cast.php`));
    strict_1.default.equal((0, index_js_1.resolveView)('errors.500', V, '.cast.php', fs).file, path.normalize(`${V}/errors/500.php`));
    strict_1.default.equal((0, index_js_1.resolveView)('nope.nope', V, '.cast.php', fs).file, null);
});
(0, node_test_1.default)('modules: js and css files under resources', () => {
    const R = '/app/resources';
    const fs = fakeFs(`${R}/js/items/items.module.js`, `${R}/css/items/items.css`, `${R}/css/app.css`, `${R}/js/app/app.module.js`);
    strict_1.default.equal((0, index_js_1.resolveModule)('items.items', 'js', R, fs).file, path.normalize(`${R}/js/items/items.module.js`));
    strict_1.default.equal((0, index_js_1.resolveModule)('items.items', 'css', R, fs).file, path.normalize(`${R}/css/items/items.css`));
    strict_1.default.equal((0, index_js_1.resolveModule)('app', 'css', R, fs).file, path.normalize(`${R}/css/app.css`));
    strict_1.default.equal((0, index_js_1.resolveModule)('app.app', 'js', R, fs).file, path.normalize(`${R}/js/app/app.module.js`));
    strict_1.default.equal((0, index_js_1.resolveModule)('nope', 'js', R, fs).file, null);
});
(0, node_test_1.default)('props are read from ??= defaults and @var / @param docblocks', () => {
    const source = `<?php
/** @var string $title the heading
 * @param bool $hasLabel */
$label ??= 'Input';
$type ??= 'text';
echo $children; $data['x'];
$this->x ??= 1;`;
    strict_1.default.deepEqual((0, index_js_1.propsOf)(source).sort(), ['hasLabel', 'label', 'title', 'type']);
});
//# sourceMappingURL=resolve.test.js.map