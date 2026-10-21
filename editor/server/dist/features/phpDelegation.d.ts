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
    private isValidHover;
    completion(document: CastDocument, position: Position): Promise<CompletionItem[] | CompletionList | null>;
    definition(document: CastDocument, position: Position): Promise<PhpDefinition | null>;
    signatureHelp(document: CastDocument, position: Position): Promise<SignatureHelp | null>;
    private targetAt;
    private requestParams;
    private toSourceRange;
    /**
     * Maps an edit's range, or drops the edit (returns null) when the range falls in generated-only virtual text
     * (buildPhpVirtual's own preamble/control-flow wrappers never map to a source range - see SourceMap.toSourceRange).
     * A dropped textEdit still leaves the completion item usable via its own insertText/label; a dropped
     * additionalTextEdit is simply omitted. Applying either at its untranslated virtual-document coordinates would
     * silently corrupt the real Cast file at an arbitrary offset.
     */
    private mapEdit;
    private mapCompletion;
    /** Maps a definition result's range, or drops it (returns null) when mapping fails - never returns a Location
     * still pointing at the virtual `.cast-php` document, which has no real editor behind it. */
    private mapLocation;
}
export {};
//# sourceMappingURL=phpDelegation.d.ts.map