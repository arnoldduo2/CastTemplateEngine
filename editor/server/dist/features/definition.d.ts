import { Definition, Position } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
export declare class DefinitionProvider {
    private projectIndex;
    constructor(projectIndex: ProjectIndex);
    getDefinition(doc: CastDocument, position: Position): Definition | null;
    /** The documented prop for an attribute name, matching the engine's camelCasing (`has-label` is `hasLabel`). */
    private findProp;
    private positionInRange;
}
//# sourceMappingURL=definition.d.ts.map