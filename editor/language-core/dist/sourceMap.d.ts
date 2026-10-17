import { OffsetRange } from './types.js';
export interface SourceMapSegment {
    source: OffsetRange | null;
    virtual: OffsetRange;
    generated: boolean;
}
/** Maps only copied source segments; generated wrappers intentionally map to null. */
export declare class SourceMap {
    private readonly segments;
    add(segment: SourceMapSegment): void;
    toSourceOffset(offset: number): number | null;
    toVirtualOffset(offset: number): number | null;
    toSourceRange(range: OffsetRange): OffsetRange | null;
}
//# sourceMappingURL=sourceMap.d.ts.map