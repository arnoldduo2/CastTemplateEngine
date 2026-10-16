import { Range, Position, DiagnosticSeverity } from 'vscode-languageserver';

export interface PropDefinition {
  name: string;
  type: string;
  isNullable: boolean;
  isRequired: boolean;
  defaultValue?: string;
  description?: string;
  range?: Range;
}

export interface ComponentMetadata {
  tag: string;              // e.g. "Btns.Soft" or "Button"
  fsPath: string;           // absolute file path
  relativePath: string;     // relative path inside components folder
  isFramework: boolean;     // true if shipped by framework / starter / demo / error page
  description?: string;     // parsed from docblock
  extends?: string;         // target of @props extends::...
  props: Map<string, PropDefinition>;
  slots: string[];
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
    hole: { open: string; close: string; description: string };
    native: { open: string; close: string; description: string };
    escapedLiteral: { token: string; output: string; description: string };
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
