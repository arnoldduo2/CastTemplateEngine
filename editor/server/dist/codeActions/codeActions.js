"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeActionsManager = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
class CodeActionsManager {
    /** `diagnostics` is the full computed set for this document (DiagnosticsManager.getFastDiagnostics's result,
     * merged with any PHP diagnostics) - not `doc.diagnostics`, which is only CastParser's own structural subset
     * and never carries a missing-prop/unknown-prop/invalid-value fix. */
    getCodeActions(doc, params, diagnostics) {
        const actions = [];
        for (const diag of diagnostics) {
            if (!diag.fix || !this.rangesOverlap(diag.range, params.range))
                continue;
            for (const fix of diag.fix) {
                const textEdit = {
                    range: fix.range,
                    newText: fix.newText
                };
                const workspaceEdit = {
                    changes: {
                        [params.textDocument.uri]: [textEdit]
                    }
                };
                actions.push({
                    title: fix.title,
                    kind: vscode_languageserver_1.CodeActionKind.QuickFix,
                    diagnostics: [{
                            range: diag.range,
                            message: diag.message,
                            severity: diag.severity,
                            code: diag.code
                        }],
                    edit: workspaceEdit
                });
            }
        }
        return actions;
    }
    rangesOverlap(a, b) {
        return (a.start.line <= b.end.line &&
            a.end.line >= b.start.line);
    }
}
exports.CodeActionsManager = CodeActionsManager;
//# sourceMappingURL=codeActions.js.map