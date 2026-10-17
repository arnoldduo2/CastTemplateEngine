import { VirtualPhpDocument } from 'cast-language-core';
import { PhpDiagnosticClient, UpstreamDiagnostic } from './phpRouter.js';
export interface PhpactorCommand {
    command: string;
    args: string[];
}
/** A persistent LSP client for Phpactor; Cast files are synchronized as virtual PHP documents. */
export declare class PhpactorClient implements PhpDiagnosticClient {
    private readonly command;
    private process;
    private connection;
    private readonly openedVersions;
    private readonly diagnostics;
    constructor(command: PhpactorCommand);
    start(workspaceFolders: string[]): Promise<void>;
    synchronize(virtual: VirtualPhpDocument, version?: number): Promise<UpstreamDiagnostic[]>;
    request<T>(method: string, params: unknown): Promise<T | null>;
    stop(): Promise<void>;
    private dispose;
}
//# sourceMappingURL=phpactorClient.d.ts.map