import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  WorkspaceEdit,
  TextEdit
} from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';

export class CodeActionsManager {
  public getCodeActions(doc: CastDocument, params: CodeActionParams): CodeAction[] {
    const actions: CodeAction[] = [];

    for (const diag of doc.diagnostics) {
      if (diag.fix && this.rangesOverlap(diag.range, params.range)) {
        const textEdit: TextEdit = {
          range: diag.fix.range,
          newText: diag.fix.newText
        };

        const workspaceEdit: WorkspaceEdit = {
          changes: {
            [params.textDocument.uri]: [textEdit]
          }
        };

        actions.push({
          title: diag.fix.title,
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
