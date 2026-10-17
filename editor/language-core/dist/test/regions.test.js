"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const index_js_1 = require("../index.js");
(0, node_test_1.default)('classifies non-overlapping embedded language regions', () => {
    const result = (0, index_js_1.analyzeCast)('@if ($ok)\n@php($x = 1)\n@css(.a { color: @{ $x }; })\n@js(console.log(1))\n@endif');
    strict_1.default.deepEqual(result.regions.map((region) => region.kind), ['php', 'php', 'css', 'php', 'javascript']);
    strict_1.default.equal(result.directives[0].nameRange.text, '@if');
});
//# sourceMappingURL=regions.test.js.map