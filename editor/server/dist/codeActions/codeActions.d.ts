import { CodeAction, CodeActionParams } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { CastDiagnostic } from '../types.js';
export declare class CodeActionsManager {
    /** `diagnostics` is the full computed set for this document (DiagnosticsManager.getFastDiagnostics's result,
     * merged with any PHP diagnostics) - not `doc.diagnostics`, which is only CastParser's own structural subset
     * and never carries a missing-prop/unknown-prop/invalid-value fix. */
    getCodeActions(doc: CastDocument, params: CodeActionParams, diagnostics: CastDiagnostic[]): CodeAction[];
    private rangesOverlap;
}
//# sourceMappingURL=codeActions.d.ts.map