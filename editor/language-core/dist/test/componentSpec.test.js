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
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const index_js_1 = require("../index.js");
(0, node_test_1.default)('matches the legacy lib/docblock.js output on every tests/fixtures/components case', () => {
    const dir = path.join(__dirname, '../../../../tests/fixtures/components');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.cast.php'))) {
        const expected = JSON.parse(fs.readFileSync(path.join(dir, file.replace('.cast.php', '.expected.json')), 'utf8'));
        strict_1.default.deepEqual((0, index_js_1.parseComponent)(fs.readFileSync(path.join(dir, file), 'utf8')), expected);
    }
});
(0, node_test_1.default)('camel/spell match the existing engine camelCasing rules', () => {
    strict_1.default.equal((0, index_js_1.camel)('has-label'), 'hasLabel');
    strict_1.default.equal((0, index_js_1.spell)('hasLabel', 'kebab'), 'has-label');
    strict_1.default.equal((0, index_js_1.spell)('hasLabel', 'snake'), 'has_label');
});
//# sourceMappingURL=componentSpec.test.js.map