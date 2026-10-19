import { Range } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from './projectIndex.js';
export interface NonComponentReference {
    kind: 'legacy-component' | 'view' | 'module';
    range: Range;
    file: string | null;
}
/**
 * Legacy `Component('btns.add-new')`/`__includes('layouts.header')`/`__modules('app', 'css')` references, resolved
 * through the same settings-aware paths component tags already use. Shared by DefinitionProvider and
 * DocumentLinksProvider so the scan-and-resolve loop isn't duplicated in both.
 */
export declare function nonComponentReferences(doc: CastDocument, projectIndex: ProjectIndex): NonComponentReference[];
//# sourceMappingURL=references.d.ts.map