"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPhpVirtual = buildPhpVirtual;
const sourceMap_js_1 = require("./sourceMap.js");
function virtualRange(text, start, end) {
    return { start, end, text: text.slice(start, end) };
}
function appendPhpRegion(output, region) {
    const owner = region.owner?.name;
    let prefix = '';
    let suffix = '';
    if (owner === 'if' || owner === 'unless' || owner === 'isset' || owner === 'while' || owner === 'switch') {
        prefix = `${owner === 'unless' ? 'if (!(' : `${owner} (`}`;
        suffix = owner === 'unless' ? ')) {}\n' : ') {}\n';
    }
    else if (owner === 'for' || owner === 'foreach' || owner === 'forelse') {
        prefix = `${owner === 'forelse' ? 'foreach' : owner} (`;
        suffix = ') {}\n';
    }
    else if (owner === 'case') {
        prefix = 'switch (true) { case ';
        suffix = ': break; }\n';
    }
    else if (owner === 'php') {
        suffix = region.range.text.trimEnd().endsWith(';') ? '\n' : ';\n';
    }
    else {
        prefix = '$_cast_value = (';
        suffix = ');\n';
    }
    output.text += prefix;
    const start = output.text.length;
    output.text += region.range.text;
    const end = output.text.length;
    const copied = virtualRange(output.text, start, end);
    output.phpRanges.push(copied);
    output.map.add({ source: region.range, virtual: copied, generated: false });
    output.text += suffix;
}
function buildPhpVirtual(uri, analysis, regions) {
    const output = { text: '<?php\ndeclare(strict_types=1);\n', map: new sourceMap_js_1.SourceMap(), phpRanges: [] };
    for (const region of regions ?? analysis.regions.filter((candidate) => candidate.kind === 'php')) {
        appendPhpRegion(output, region);
    }
    return { uri: `${uri}.cast-php`, languageId: 'php', text: output.text, map: output.map, phpRanges: output.phpRanges };
}
//# sourceMappingURL=virtualPhp.js.map