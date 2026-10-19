import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { CastDiagnostic } from '../types.js';
import { CastSettings } from '../settings.js';
export declare class DiagnosticsManager {
    private projectIndex;
    constructor(projectIndex: ProjectIndex);
    getFastDiagnostics(doc: CastDocument, settings: CastSettings): CastDiagnostic[];
    /** The documented prop for an attribute name, matching the engine's camelCasing (`has-label` is `hasLabel`). */
    private findProp;
    runAuthoritativeLint(phpPath: string, filePath: string): Promise<CastDiagnostic[]>;
}
//# sourceMappingURL=diagnostics.d.ts.map