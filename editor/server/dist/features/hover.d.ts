import { Hover, Position } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
export declare class HoverProvider {
    private projectIndex;
    private syntax;
    constructor(projectIndex: ProjectIndex);
    getHover(doc: CastDocument, position: Position): Hover | null;
    private getComponentHover;
    private getAttributeHover;
    private getDirectiveHover;
    private positionInRange;
}
//# sourceMappingURL=hover.d.ts.map