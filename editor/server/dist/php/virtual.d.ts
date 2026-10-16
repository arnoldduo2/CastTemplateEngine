import { CastDocument } from '../parser/ast.js';
import { SourceMap } from './sourceMap.js';
export interface VirtualPhpDocument {
    code: string;
    sourceMap: SourceMap;
}
export declare class VirtualPhpBuilder {
    build(doc: CastDocument): VirtualPhpDocument;
}
//# sourceMappingURL=virtual.d.ts.map