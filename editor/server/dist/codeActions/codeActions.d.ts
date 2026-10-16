import { CodeAction, CodeActionParams } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
export declare class CodeActionsManager {
    getCodeActions(doc: CastDocument, params: CodeActionParams): CodeAction[];
    private rangesOverlap;
}
//# sourceMappingURL=codeActions.d.ts.map