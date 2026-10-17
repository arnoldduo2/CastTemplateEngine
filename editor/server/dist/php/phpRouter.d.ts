import { Range } from 'vscode-languageserver';
import { VirtualPhpDocument } from 'cast-language-core';
import { CastDocument } from '../parser/ast.js';
import { CastDiagnostic } from '../types.js';
export interface UpstreamDiagnostic {
    message: string;
    severity?: number;
    code?: string | number;
    source?: string;
    range: Range;
}
/** The narrow diagnostic boundary makes Phpactor replaceable in deterministic tests. */
export interface PhpDiagnosticClient {
    synchronize(virtual: VirtualPhpDocument, version?: number): Promise<UpstreamDiagnostic[]>;
}
export declare class PhpRouter {
    private readonly client;
    constructor(client: PhpDiagnosticClient);
    getDiagnostics(document: CastDocument): Promise<CastDiagnostic[]>;
}
//# sourceMappingURL=phpRouter.d.ts.map