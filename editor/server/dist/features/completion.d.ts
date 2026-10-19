import { CompletionItem, Position } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { CastSettings } from '../settings.js';
export declare class CompletionProvider {
    private projectIndex;
    private syntax;
    private settings;
    constructor(projectIndex: ProjectIndex);
    /** The resolved cast.* settings (propCase, for attribute-name spelling) - see server.ts's onDidChangeConfiguration. */
    setSettings(settings: CastSettings): void;
    getCompletions(doc: CastDocument, position: Position): CompletionItem[];
    private offsetAt;
    private positionAt;
    private getDirectiveCompletions;
    private getComponentTagCompletions;
    private getAttributeCompletions;
    private getValueCompletions;
    /** The documented prop for an attribute name, matching the engine's camelCasing (`has-label` is `hasLabel`). */
    private findProp;
    private getExtendsCompletions;
}
//# sourceMappingURL=completion.d.ts.map