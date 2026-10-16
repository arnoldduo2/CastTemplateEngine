import { DocumentLink } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
export declare class DocumentLinksProvider {
    private projectIndex;
    constructor(projectIndex: ProjectIndex);
    getDocumentLinks(doc: CastDocument): DocumentLink[];
}
//# sourceMappingURL=documentLinks.d.ts.map