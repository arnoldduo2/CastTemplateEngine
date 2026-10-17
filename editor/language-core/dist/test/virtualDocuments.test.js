"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const index_js_1 = require("../index.js");
(0, node_test_1.default)('maps PHP ranges from directive arguments and @php bodies', () => {
    const text = '@if ($missing + )\n@php\n$x = ;\n@endphp\n@endif';
    const doc = (0, index_js_1.buildPhpVirtual)('file:///view.cast.php', (0, index_js_1.analyzeCast)(text));
    strict_1.default.deepEqual(doc.map.toSourceRange(doc.phpRanges[0]), {
        start: text.indexOf('$missing + '),
        end: text.indexOf('$missing + ') + '$missing + '.length,
        text: '$missing + '
    });
    strict_1.default.deepEqual(doc.map.toSourceRange(doc.phpRanges[1]), {
        start: text.indexOf('$x = ;'),
        end: text.indexOf('$x = ;') + '$x = ;'.length,
        text: '$x = ;'
    });
});
(0, node_test_1.default)('masks CSS interpolation and retains a PHP child region', () => {
    const docs = (0, index_js_1.buildEmbeddedVirtuals)('file:///view.cast.php', (0, index_js_1.analyzeCast)('@css(.a { color: @{ $colour + }; })'));
    strict_1.default.equal(docs.css[0].text.includes('@{'), false);
    strict_1.default.equal(docs.php.length, 1);
});
//# sourceMappingURL=virtualDocuments.test.js.map