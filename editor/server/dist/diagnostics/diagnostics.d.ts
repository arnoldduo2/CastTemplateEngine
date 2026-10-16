import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { CastDiagnostic } from '../types.js';
export declare class DiagnosticsManager {
    private projectIndex;
    constructor(projectIndex: ProjectIndex);
    getFastDiagnostics(doc: CastDocument): CastDiagnostic[];
    runAuthoritativeLint(phpPath: string, filePath: string): Promise<CastDiagnostic[]>;
}
//# sourceMappingURL=diagnostics.d.ts.map