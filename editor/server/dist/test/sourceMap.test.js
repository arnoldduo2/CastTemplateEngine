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
const virtual_js_1 = require("../php/virtual.js");
(0, node_test_1.describe)('SourceMap and Virtual PHP', () => {
    const parser = new castParser_js_1.CastParser();
    const builder = new virtual_js_1.VirtualPhpBuilder();
    (0, node_test_1.test)('maps virtual echo hole positions back to Cast template positions', () => {
        const text = `<div class="container">
    <h1>@{ $user->name }</h1>
</div>`;
        const doc = parser.parse('file:///view.cast.php', text);
        const virtualDoc = builder.build(doc);
        assert.ok(virtualDoc.code.includes('$_cast_val = ($user->name);'));
        // Find position of $user in virtual document
        const lines = virtualDoc.code.split('\n');
        let vLine = -1;
        let vChar = -1;
        for (let i = 0; i < lines.length; i++) {
            const idx = lines[i].indexOf('$user->name');
            if (idx >= 0) {
                vLine = i;
                vChar = idx;
                break;
            }
        }
        assert.ok(vLine >= 0, 'Should find expression in virtual doc');
        // Translate back to Cast position
        const castPos = virtualDoc.sourceMap.toCastPosition({ line: vLine, character: vChar });
        assert.ok(castPos, 'Translation should succeed');
        assert.strictEqual(castPos.line, 1, 'Should map to line 1');
        assert.strictEqual(castPos.character, 11, 'Should map to start of $user->name in @{ $user->name }');
    });
});
//# sourceMappingURL=sourceMap.test.js.map