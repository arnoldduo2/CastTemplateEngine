import { CompletionItem, CompletionList, Hover, Location, LocationLink, Position, SignatureHelp } from 'vscode-languageserver';
import { VirtualPhpDocument } from 'cast-language-core';
import { CastDocument } from '../parser/ast.js';
export interface PhpLanguageClient {
    synchronize(virtual: VirtualPhpDocument, version?: number): Promise<unknown>;
    request<T>(method: string, params: unknown): Promise<T | null>;
}
type PhpDefinition = Location | Location[] | LocationLink[];
/** Routes only embedded-PHP positions to Phpactor, then translates result ranges home. */
export declare class PhpDelegation {
    private readonly client;
    constructor(client: PhpLanguageClient);
    hover(document: CastDocument, position: Position): Promise<Hover | null>;
    completion(document: CastDocument, position: Position): Promise<CompletionItem[] | CompletionList | null>;
    definition(document: CastDocument, position: Position): Promise<PhpDefinition | null>;
    signatureHelp(document: CastDocument, position: Position): Promise<SignatureHelp | null>;
    private targetAt;
    private requestParams;
    private toSourceRange;
    private mapCompletion;
    private mapLocation;
}
export {};
//# sourceMappingURL=phpDelegation.d.ts.map