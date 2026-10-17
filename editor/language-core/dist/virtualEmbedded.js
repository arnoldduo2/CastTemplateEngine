"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEmbeddedVirtuals = buildEmbeddedVirtuals;
const sourceMap_js_1 = require("./sourceMap.js");
const virtualPhp_js_1 = require("./virtualPhp.js");
function buildEmbedded(uri, analysis, region, kind) {
    const holes = analysis.regions.filter((candidate) => candidate.kind === 'php' && candidate.owner === region.owner && candidate.range.start >= region.range.start && candidate.range.end <= region.range.end);
    const chars = region.range.text.split('');
    for (const hole of holes) {
        const start = hole.range.start - region.range.start;
        const end = hole.range.end - region.range.start;
        for (let index = start; index < end; index += 1)
            chars[index] = chars[index] === '\n' ? '\n' : ' ';
        // Mask the @, braces, and optional surrounding whitespace as well.
        const holeMarker = analysis.text.lastIndexOf('@{', hole.range.start);
        if (holeMarker >= region.range.start) {
            for (let index = holeMarker - region.range.start; index < start; index += 1)
                chars[index] = chars[index] === '\n' ? '\n' : ' ';
            const closing = analysis.text.indexOf('}', hole.range.end);
            if (closing !== -1 && closing < region.range.end) {
                for (let index = end; index <= closing - region.range.start; index += 1)
                    chars[index] = chars[index] === '\n' ? '\n' : ' ';
            }
        }
    }
    const text = chars.join('');
    const map = new sourceMap_js_1.SourceMap();
    const virtual = { start: 0, end: text.length, text };
    map.add({ source: region.range, virtual, generated: false });
    return { uri: `${uri}.cast-${kind}-${region.range.start}`, languageId: kind, text, map };
}
function buildEmbeddedVirtuals(uri, analysis) {
    const css = analysis.regions.filter((region) => region.kind === 'css').map((region) => buildEmbedded(uri, analysis, region, 'css'));
    const javascript = analysis.regions.filter((region) => region.kind === 'javascript').map((region) => buildEmbedded(uri, analysis, region, 'javascript'));
    const embeddedPhp = analysis.regions
        .filter((region) => region.kind === 'php' && (region.owner?.name === 'css' || region.owner?.name === 'js' || region.owner?.name === 'script'))
        .map((region) => (0, virtualPhp_js_1.buildPhpVirtual)(uri, analysis, [region]));
    return { css, javascript, php: embeddedPhp };
}
//# sourceMappingURL=virtualEmbedded.js.map