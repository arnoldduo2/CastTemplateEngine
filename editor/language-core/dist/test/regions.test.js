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
(0, node_test_1.default)('@map/@filter PHP region stops before a trailing return(<markup/>)/@render(<markup/>) - markup is not PHP', () => {
    const mapSrc = "@map($items, ($item, $i) => return(<Card key={$i}>@{ $item->name }</Card>))";
    const mapRegion = (0, index_js_1.analyzeCast)(mapSrc).regions.find((region) => region.kind === 'php' && region.owner?.name === 'map');
    strict_1.default.ok(mapRegion, 'a php region exists for the @map call');
    strict_1.default.equal(mapRegion.range.text, '$items, ($item, $i) => ', 'stops right before return(, never includes the markup');
    const renderSrc = "@map($items, ($item, $i) => @render(<Card>@{ $item->name }</Card>))";
    const renderRegion = (0, index_js_1.analyzeCast)(renderSrc).regions.find((region) => region.kind === 'php' && region.owner?.name === 'map');
    strict_1.default.equal(renderRegion.range.text, '$items, ($item, $i) => ', '@render(...) is excluded the same way as return(...)');
    // @filter's 2-arg standalone form has no return()/markup at all - a plain PHP predicate - so nothing is excluded
    const filterSrc = "@filter($items, ($item) => $item->qty > 0)";
    const filterRegion = (0, index_js_1.analyzeCast)(filterSrc).regions.find((region) => region.kind === 'php' && region.owner?.name === 'filter');
    strict_1.default.equal(filterRegion.range.text, "$items, ($item) => $item->qty > 0");
});
//# sourceMappingURL=regions.test.js.map