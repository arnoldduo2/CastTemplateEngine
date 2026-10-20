import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { CastDiagnostic } from '../types.js';
import { CastSettings } from '../settings.js';
export declare class DiagnosticsManager {
    private projectIndex;
    constructor(projectIndex: ProjectIndex);
    getFastDiagnostics(doc: CastDocument, settings: CastSettings): CastDiagnostic[];
    /** A required prop can also be given by a `<Slot name="x">` child inside the tag's own body, not just an
     * attribute or a documented @slot - matches editor/vscode/lib/complete.js's own isProvidedBySlot. */
    private isProvidedBySlot;
    /** The documented prop for an attribute name, matching the engine's camelCasing (`has-label` is `hasLabel`). */
    private findProp;
    runAuthoritativeLint(phpPath: string, filePath: string): Promise<CastDiagnostic[]>;
}
//# sourceMappingURL=diagnostics.d.ts.map