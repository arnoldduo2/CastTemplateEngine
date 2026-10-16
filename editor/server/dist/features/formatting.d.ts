import { FormattingOptions, TextEdit } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
export declare class FormattingProvider {
    format(doc: CastDocument, options: FormattingOptions): TextEdit[];
}
//# sourceMappingURL=formatting.d.ts.map