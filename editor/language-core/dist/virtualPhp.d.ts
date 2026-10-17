import { SourceMap } from './sourceMap.js';
import { CastAnalysis, OffsetRange, Region } from './types.js';
export interface VirtualDocument {
    uri: string;
    languageId: 'php' | 'css' | 'javascript';
    text: string;
    map: SourceMap;
}
export interface VirtualPhpDocument extends VirtualDocument {
    languageId: 'php';
    /** Ranges in the virtual document that came from Cast PHP source. */
    phpRanges: OffsetRange[];
}
export declare function buildPhpVirtual(uri: string, analysis: CastAnalysis, regions?: Region[]): VirtualPhpDocument;
//# sourceMappingURL=virtualPhp.d.ts.map