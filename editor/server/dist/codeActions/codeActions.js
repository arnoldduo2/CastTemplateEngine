"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeActionsManager = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
class CodeActionsManager {
    getCodeActions(doc, params) {
        const actions = [];
        for (const diag of doc.diagnostics) {
            if (diag.fix && this.rangesOverlap(diag.range, params.range)) {
                const textEdit = {
                    range: diag.fix.range,
                    newText: diag.fix.newText
                };
                const workspaceEdit = {
                    changes: {
                        [params.textDocument.uri]: [textEdit]
                    }
                };
                actions.push({
                    title: diag.fix.title,
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