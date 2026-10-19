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
const vscode_languageserver_1 = require("vscode-languageserver");
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
    (0, node_test_1.test)('directive completions carry an explicit replacement edit for the typed @ prefix, plus @js and @{}', () => {
        const text = '<div>\n    @ph';
        const doc = parser.parse('file:///view.cast.php', text);
        const items = completionProvider.getCompletions(doc, { line: 1, character: 7 });
        const php = items.find(i => i.label === '@php');
        assert.ok(php?.textEdit && 'newText' in php.textEdit, '@php completion should carry an explicit replacement edit');
        assert.equal(php.textEdit.newText, '@php\n\t$0\n@endphp');
        assert.deepEqual(php.textEdit.range, { start: { line: 1, character: 4 }, end: { line: 1, character: 7 } });
        const js = items.find(i => i.label === '@js');
        assert.ok(js, 'should offer an @js completion alongside @css and @script');
        assert.equal(js.insertTextFormat, vscode_languageserver_1.InsertTextFormat.Snippet);
        const hole = items.find(i => i.label === '@{}');
        assert.ok(hole, 'should offer an @{} echo-hole completion');
        assert.equal(hole.textEdit.newText, '@{ ${1:expression} }');
    });
    (0, node_test_1.test)('hover on directives returns syntax documentation', () => {
        const text = `@if ($active)\n    <span>Active</span>\n@endif`;
        const doc = parser.parse('file:///view.cast.php', text);
        const hover = hoverProvider.getHover(doc, { line: 0, character: 1 });
        assert.ok(hover, 'Should return hover for @if');
        const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
        assert.ok(md.includes('Cast Directive: `@if`'));
    });
    (0, node_test_1.test)('directive hover uses a markdown fence the editor understands, never an unregistered "cast" fence', () => {
        const text = `@if ($active)\n    <span>Active</span>\n@endif`;
        const doc = parser.parse('file:///view.cast.php', text);
        const hover = hoverProvider.getHover(doc, { line: 0, character: 1 });
        assert.ok(hover, 'Should return hover for @if');
        const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
        assert.ok(!md.includes('```cast'), 'must not use the unregistered cast fence');
        assert.ok(md.includes('```php'), 'should fall back to a registered fence (php) for directive syntax');
    });
    (0, node_test_1.test)('formatting cleans up directive indentation', () => {
        const unformatted = `@if ($active)\n<p>Active</p>\n@else\n<p>Inactive</p>\n@endif`;
        const doc = parser.parse('file:///view.cast.php', unformatted);
        const edits = formattingProvider.format(doc, { tabSize: 4, insertSpaces: true });
        assert.ok(edits.length > 0, 'Should produce formatting edits');
        const result = edits[0].newText;
        assert.ok(result.includes('    <p>Active</p>'), 'Inner paragraph should be indented');
    });
    (0, node_test_1.test)('formatting indents nested HTML tags and leaves <script> body content untouched, the same shared scanner the extension uses', () => {
        const unformatted = '<div>\n<script>\n  let a = 1;\n      if (a) { a++ }\n</script>\n</div>';
        const doc = parser.parse('file:///view.cast.php', unformatted);
        const edits = formattingProvider.format(doc, { tabSize: 4, insertSpaces: true });
        assert.ok(edits.length > 0, 'Should produce formatting edits');
        const result = edits[0].newText;
        assert.ok(result.includes('    <script>'), '<script> is indented as a child of <div>');
        assert.ok(result.includes('  let a = 1;'), 'original interior indentation inside <script> is preserved verbatim');
        assert.ok(result.includes('      if (a) { a++ }'), 'original interior indentation inside <script> is preserved verbatim');
    });
    (0, node_test_1.test)('hover on a builtin like handleEvent returns the shared markdown', () => {
        const doc = parser.parse('file:///view.cast.php', '@script(handleEvent("click", ".btn", () => {}))');
        const hover = hoverProvider.getHover(doc, positionOfWord(doc.text, 'handleEvent'));
        assert.ok(hover, 'Should return hover for handleEvent');
        const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
        assert.match(md, /Registers a delegated event listener/);
    });
    (0, node_test_1.test)('hover on @{ immediately followed by { explains the echo hole', () => {
        const doc = parser.parse('file:///view.cast.php', '<p>@{ $x }</p>');
        const hover = hoverProvider.getHover(doc, { line: 0, character: 4 });
        assert.ok(hover, 'Should return hover for the echo hole');
        const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
        assert.match(md, /echo hole/);
    });
    (0, node_test_1.test)('hover on a fluent .map() in a chain explains the chain, not a generic directive', () => {
        const doc = parser.parse('file:///view.cast.php', '<p>@$items.filter(($i) => $i.active).map(($i) => $i.name)</p>');
        const hover = hoverProvider.getHover(doc, positionOfWord(doc.text, 'map'));
        assert.ok(hover, 'Should return hover for the chained .map()');
        const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
        assert.match(md, /fluent chain/);
    });
});
/** The {line, character} of the first occurrence of `word` in `text` - test-only convenience. */
function positionOfWord(text, word) {
    const offset = text.indexOf(word);
    const prefix = text.slice(0, offset);
    const lines = prefix.split('\n');
    return { line: lines.length - 1, character: lines[lines.length - 1].length };
}
//# sourceMappingURL=features.test.js.map