import { Position, Range } from 'vscode-languageserver';
export interface SourceMapping {
    castRange: Range;
    virtualRange: Range;
}
export declare class SourceMap {
    private mappings;
    addMapping(castRange: Range, virtualRange: Range): void;
    toCastPosition(virtualPos: Position): Position | null;
    toVirtualPosition(castPos: Position): Position | null;
}
//# sourceMappingURL=sourceMap.d.ts.map