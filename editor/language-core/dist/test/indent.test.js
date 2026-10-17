"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const indent_js_1 = require("../indent.js");
(0, node_test_1.default)('a multiline @php statement never waits for @endphp', () => {
    const output = (0, indent_js_1.formatCast)('@php(\n  $docs = config(\n    "docs"\n  )\n)\n@props {\nstring $title;\n}\n@if ($docs)\n<nav></nav>\n@endif');
    strict_1.default.match(output, /    string \$title;/);
    strict_1.default.match(output, /    <nav><\/nav>/);
});
(0, node_test_1.default)('a single-line @php(...) statement is unaffected', () => {
    const output = (0, indent_js_1.formatCast)('<div>\n@php($n = 5)\n<p>x</p>\n</div>');
    strict_1.default.equal(output, '<div>\n    @php($n = 5)\n    <p>x</p>\n</div>');
});
//# sourceMappingURL=indent.test.js.map