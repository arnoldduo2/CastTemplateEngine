import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  WorkspaceEdit,
  TextEdit
} from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { CastDiagnostic } from '../types.js';

export class CodeActionsManager {
  /** `diagnostics` is the full computed set for this document (DiagnosticsManager.getFastDiagnostics's result,
   * merged with any PHP diagnostics) - not `doc.diagnostics`, which is only CastParser's own structural subset
   * and never carries a missing-prop/unknown-prop/invalid-value fix. */
  public getCodeActions(doc: CastDocument, params: CodeActionParams, diagnostics: CastDiagnostic[]): CodeAction[] {
    const actions: CodeAction[] = [];

    for (const diag of diagnostics) {
      if (!diag.fix || !this.rangesOverlap(diag.range, params.range)) continue;
      for (const fix of diag.fix) {
        const textEdit: TextEdit = {
          range: fix.range,
          newText: fix.newText
        };

        const workspaceEdit: WorkspaceEdit = {
          changes: {
            [params.textDocument.uri]: [textEdit]
          }
        };

        actions.push({
          title: fix.title,
          kind: CodeActionKind.QuickFix,
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

  private rangesOverlap(a: any, b: any): boolean {
    return (
      a.start.line <= b.end.line &&
      a.end.line >= b.start.line
    );
  }
}
