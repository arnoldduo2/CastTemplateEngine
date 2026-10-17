"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceMap = void 0;
/** Maps only copied source segments; generated wrappers intentionally map to null. */
class SourceMap {
    segments = [];
    add(segment) {
        this.segments.push(segment);
    }
    toSourceOffset(offset) {
        const segment = this.segments.find(({ virtual }) => offset >= virtual.start && offset <= virtual.end);
        if (!segment || segment.generated || !segment.source)
            return null;
        return segment.source.start + Math.min(offset - segment.virtual.start, segment.source.end - segment.source.start);
    }
    toVirtualOffset(offset) {
        const segment = this.segments.find(({ source }) => source !== null && offset >= source.start && offset <= source.end);
        if (!segment || !segment.source || segment.generated)
            return null;
        return segment.virtual.start + Math.min(offset - segment.source.start, segment.virtual.end - segment.virtual.start);
    }
    toSourceRange(range) {
        const start = this.toSourceOffset(range.start);
        const end = this.toSourceOffset(range.end);
        if (start === null || end === null)
            return null;
        const segment = this.segments.find(({ virtual }) => range.start >= virtual.start && range.end <= virtual.end);
        if (!segment?.source)
            return null;
        return { start, end, text: segment.source.text.slice(start - segment.source.start, end - segment.source.start) };
    }
}
exports.SourceMap = SourceMap;
//# sourceMappingURL=sourceMap.js.map