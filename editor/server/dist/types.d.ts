import { Range, DiagnosticSeverity } from 'vscode-languageserver';
import { SlotSpec } from 'cast-language-core';
export interface PropDefinition {
    name: string;
    type: string;
    isNullable: boolean;
    isRequired: boolean;
    defaultValue?: string;
    description?: string;
    range?: Range;
    values?: string[];
    kind?: 'bool' | 'number' | 'string' | 'other';
    deprecated?: boolean | string;
    inferred?: boolean;
}
export interface ComponentMetadata {
    tag: string;
    fsPath: string;
    relativePath: string;
    isFramework: boolean;
    description?: string;
    extends?: string;
    props: Map<string, PropDefinition>;
    slots: SlotSpec[];
    deprecated?: boolean | string;
    examples?: string[];
    mtime: number;
}
export interface CastDirectiveSpec {
    name: string;
    description: string;
    hasArgs?: boolean;
    close?: string;
    intermediates?: string[];
    signature?: string;
}
export interface CastSyntaxSpec {
    version: string;
    echo: {
        hole: {
            open: string;
            close: string;
            description: string;
        };
        native: {
            open: string;
            close: string;
            description: string;
        };
        escapedLiteral: {
            token: string;
            output: string;
            description: string;
        };
    };
    blocks: Record<string, {
        open: string;
        hasArgs: boolean;
        close: string;
        intermediates: string[];
        description: string;
    }>;
    props: {
        directive: string;
        syntax: string;
        inheritanceSyntax: string;
        entryTerminator: string;
        supportedTypes: string[];
    };
    functionDirectives: Record<string, string>;
    components: {
        tagPattern: string;
        slotTag: string;
    };
    allDirectiveWords: string[];
}
export interface CastDiagnostic {
    range: Range;
    message: string;
    severity: DiagnosticSeverity;
    code?: string;
    source?: string;
    fix?: {
        title: string;
        newText: string;
        range: Range;
    };
}
//# sourceMappingURL=types.d.ts.map