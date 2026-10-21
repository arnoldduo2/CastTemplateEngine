"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const castParser_js_1 = require("../parser/castParser.js");
const phpDelegation_js_1 = require("../features/phpDelegation.js");
(0, node_test_1.default)('delegates hover inside a directive argument but not on its marker', async () => {
    const document = new castParser_js_1.CastParser().parse('file:///view.cast.php', '@php(testFunction($value))');
    const client = {
        async synchronize() { },
        async request(method, params) {
            strict_1.default.equal(method, 'textDocument/hover');
            strict_1.default.equal(params.textDocument.uri, 'file:///view.cast.php.cast-php');
            return {
                contents: { kind: 'markdown', value: 'PHP function' },
                range: { start: { line: 2, character: 15 }, end: { line: 2, character: 27 } }
            };
        }
    };
    const delegation = new phpDelegation_js_1.PhpDelegation(client);
    const delegated = await delegation.hover(document, { line: 0, character: 6 });
    const marker = await delegation.hover(document, { line: 0, character: 1 });
    strict_1.default.equal((delegated?.contents).value, 'PHP function');
    strict_1.default.equal(marker, null);
});
(0, node_test_1.default)('a completion edit that cannot be mapped back to source is dropped, not left pointing at the virtual document', async () => {
    const document = new castParser_js_1.CastParser().parse('file:///view.cast.php', '@php(testFunction($value))');
    const client = {
        async synchronize() { },
        async request() {
            return [{
                    label: 'bad',
                    // this range falls inside buildPhpVirtual's generated "<?php\ndeclare(strict_types=1);\n" preamble, which
                    // has no source mapping at all - exactly the case a real Phpactor "insert a use statement at the top of
                    // the file" edit would hit.
                    textEdit: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: 'use Foo;\n' },
                    insertText: 'bad',
                }];
        },
    };
    const delegation = new phpDelegation_js_1.PhpDelegation(client);
    const items = await delegation.completion(document, { line: 0, character: 6 });
    strict_1.default.ok(Array.isArray(items));
    strict_1.default.equal(items[0] && items[0].textEdit, undefined, 'the unmappable edit is dropped, not left at virtual coordinates');
    strict_1.default.equal(items[0].insertText, 'bad', 'insertText survives as a safe fallback');
});
(0, node_test_1.default)('a definition whose range cannot be mapped back to source is dropped, not left pointing at the virtual document', async () => {
    const document = new castParser_js_1.CastParser().parse('file:///view.cast.php', '@php(testFunction($value))');
    const client = {
        async synchronize() { },
        async request() {
            return {
                uri: 'file:///view.cast.php.cast-php',
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            };
        },
    };
    const delegation = new phpDelegation_js_1.PhpDelegation(client);
    const result = await delegation.definition(document, { line: 0, character: 6 });
    strict_1.default.equal(result, null, 'an unmappable location is dropped rather than returned pointing at the virtual document');
});
(0, node_test_1.default)('hover drops Phpactor error message (Could not find source with) instead of showing it to the user', async () => {
    const document = new castParser_js_1.CastParser().parse('file:///view.cast.php', '@php(testFunction($value))');
    const client = {
        async synchronize() { },
        async request(method) {
            strict_1.default.equal(method, 'textDocument/hover');
            return {
                contents: { kind: 'markdown', value: 'Could not find source with "testFunction"' },
                range: { start: { line: 2, character: 15 }, end: { line: 2, character: 27 } }
            };
        }
    };
    const delegation = new phpDelegation_js_1.PhpDelegation(client);
    const result = await delegation.hover(document, { line: 0, character: 6 });
    strict_1.default.equal(result, null, 'Phpactor error hovers must be dropped');
});
//# sourceMappingURL=phpDelegation.test.js.map