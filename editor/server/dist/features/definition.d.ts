import { Definition, Position } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
export declare class DefinitionProvider {
    private projectIndex;
    constructor(projectIndex: ProjectIndex);
    getDefinition(doc: CastDocument, position: Position): Definition | null;
    private positionInRange;
}
//# sourceMappingURL=definition.d.ts.map