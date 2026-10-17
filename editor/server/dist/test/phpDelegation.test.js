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
//# sourceMappingURL=phpDelegation.test.js.map