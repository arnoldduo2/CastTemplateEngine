import { CompletionItem, Position } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
export declare class CompletionProvider {
    private projectIndex;
    private syntax;
    constructor(projectIndex: ProjectIndex);
    getCompletions(doc: CastDocument, position: Position): CompletionItem[];
    private getDirectiveCompletions;
    private getComponentTagCompletions;
    private getAttributeCompletions;
    private getExtendsCompletions;
    private findComponentTagContext;
}
//# sourceMappingURL=completion.d.ts.map