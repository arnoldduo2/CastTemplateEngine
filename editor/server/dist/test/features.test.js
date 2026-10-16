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
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert"));
const castParser_js_1 = require("../parser/castParser.js");
const projectIndex_js_1 = require("../index/projectIndex.js");
const completion_js_1 = require("../features/completion.js");
const hover_js_1 = require("../features/hover.js");
const formatting_js_1 = require("../features/formatting.js");
(0, node_test_1.describe)('Language Server Features', () => {
    const parser = new castParser_js_1.CastParser();
    const index = new projectIndex_js_1.ProjectIndex();
    const completionProvider = new completion_js_1.CompletionProvider(index);
    const hoverProvider = new hover_js_1.HoverProvider(index);
    const formattingProvider = new formatting_js_1.FormattingProvider();
    (0, node_test_1.test)('directive completions trigger on @', () => {
        const text = `<div class="main">\n    @`;
        const doc = parser.parse('file:///view.cast.php', text);
        const items = completionProvider.getCompletions(doc, { line: 1, character: 5 });
        assert.ok(items.length > 0, 'Should return directive completions');
        const labels = items.map(i => i.label);
        assert.ok(labels.includes('@if'), 'Should include @if');
        assert.ok(labels.includes('@foreach'), 'Should include @foreach');
        assert.ok(labels.includes('@props'), 'Should include @props');
    });
    (0, node_test_1.test)('hover on directives returns syntax documentation', () => {
        const text = `@if ($active)\n    <span>Active</span>\n@endif`;
        const doc = parser.parse('file:///view.cast.php', text);
        const hover = hoverProvider.getHover(doc, { line: 0, character: 1 });
        assert.ok(hover, 'Should return hover for @if');
        const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
        assert.ok(md.includes('Cast Directive: `@if`'));
    });
    (0, node_test_1.test)('formatting cleans up directive indentation', () => {
        const unformatted = `@if ($active)\n<p>Active</p>\n@else\n<p>Inactive</p>\n@endif`;
        const doc = parser.parse('file:///view.cast.php', unformatted);
        const edits = formattingProvider.format(doc, { tabSize: 4, insertSpaces: true });
        assert.ok(edits.length > 0, 'Should produce formatting edits');
        const result = edits[0].newText;
        assert.ok(result.includes('    <p>Active</p>'), 'Inner paragraph should be indented');
    });
});
//# sourceMappingURL=features.test.js.map