"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceMap = void 0;
class SourceMap {
    mappings = [];
    addMapping(castRange, virtualRange) {
        this.mappings.push({ castRange, virtualRange });
    }
    toCastPosition(virtualPos) {
        for (const m of this.mappings) {
            if (virtualPos.line >= m.virtualRange.start.line &&
                virtualPos.line <= m.virtualRange.end.line) {
                // Line delta
                const lineOffset = virtualPos.line - m.virtualRange.start.line;
                const targetLine = m.castRange.start.line + lineOffset;
                // Character calculation
                let targetChar = m.castRange.start.character;
                if (lineOffset === 0) {
                    targetChar += (virtualPos.character - m.virtualRange.start.character);
                }
                else {
                    targetChar = virtualPos.character;
                }
                return { line: targetLine, character: targetChar };
            }
        }
        return null;
    }
    toVirtualPosition(castPos) {
        for (const m of this.mappings) {
            if (castPos.line >= m.castRange.start.line &&
                castPos.line <= m.castRange.end.line) {
                const lineOffset = castPos.line - m.castRange.start.line;
                const targetLine = m.virtualRange.start.line + lineOffset;
                let targetChar = m.virtualRange.start.character;
                if (lineOffset === 0) {
                    targetChar += (castPos.character - m.castRange.start.character);
                }
                else {
                    targetChar = castPos.character;
                }
                return { line: targetLine, character: targetChar };
            }
        }
        return null;
    }
}
exports.SourceMap = SourceMap;
//# sourceMappingURL=sourceMap.js.map