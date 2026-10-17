"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const castParser_js_1 = require("../../parser/castParser.js");
const phpRouter_js_1 = require("../phpRouter.js");
(0, node_test_1.default)('maps PHP diagnostics to a Cast echo hole', async () => {
    const parser = new castParser_js_1.CastParser();
    const document = parser.parse('file:///view.cast.php', '@{ $user->missing + }');
    const client = {
        async synchronize(virtual) {
            const expression = '$user->missing +';
            const start = virtual.text.indexOf(expression);
            return [{
                    message: 'Unexpected token',
                    severity: 1,
                    range: { start: { line: 2, character: start - virtual.text.lastIndexOf('\n', start) - 1 }, end: { line: 2, character: start - virtual.text.lastIndexOf('\n', start) - 1 + expression.length } }
                }];
        }
    };
    const router = new phpRouter_js_1.PhpRouter(client);
    const diagnostics = await router.getDiagnostics(document);
    strict_1.default.equal(diagnostics[0].source, 'cast-php');
    strict_1.default.deepEqual(diagnostics[0].range, {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 19 }
    });
});
//# sourceMappingURL=phpRouter.test.js.map