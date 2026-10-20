import { Hover, Position } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
export declare class HoverProvider {
    private projectIndex;
    private syntax;
    constructor(projectIndex: ProjectIndex);
    getHover(doc: CastDocument, position: Position): Hover | null;
    /** The hover for a resolved/unresolved file reference (a component tag with no indexed metadata, or a legacy
     * Component()/view()/module() call) - ported from extension.js's Hovers (the "No file found. Looked for:"
     * text is the main way a user debugs a misnamed reference, so losing it once the LSP takes over would be a
     * real regression, not a cosmetic one). */
    private referenceHover;
    private getComponentHover;
    private getAttributeHover;
    private getDirectiveHover;
    private positionInRange;
}
//# sourceMappingURL=hover.d.ts.map