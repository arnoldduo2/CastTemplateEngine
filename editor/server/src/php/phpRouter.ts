import { DiagnosticSeverity, Position, Range } from 'vscode-languageserver';
import { analyzeCast, buildPhpVirtual, VirtualPhpDocument } from 'cast-language-core';
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

function offsetAt(text: string, position: Position): number {
  let line = 0;
  let offset = 0;
  while (line < position.line && offset < text.length) {
    const newline = text.indexOf('\n', offset);
    offset = newline === -1 ? text.length : newline + 1;
    line += 1;
  }
  return Math.min(offset + position.character, text.length);
}

function positionAt(text: string, requested: number): Position {
  const offset = Math.max(0, Math.min(requested, text.length));
  const before = text.slice(0, offset);
  const line = (before.match(/\n/g) ?? []).length;
  const start = before.lastIndexOf('\n') + 1;
  return { line, character: offset - start };
}

export class PhpRouter {
  constructor(private readonly client: PhpDiagnosticClient) {}

  public async getDiagnostics(document: CastDocument): Promise<CastDiagnostic[]> {
    const virtual = buildPhpVirtual(document.uri, analyzeCast(document.text));
    const upstream = await this.client.synchronize(virtual, document.version);
    const diagnostics: CastDiagnostic[] = [];
    for (const diagnostic of upstream) {
      const virtualRange = {
        start: offsetAt(virtual.text, diagnostic.range.start),
        end: offsetAt(virtual.text, diagnostic.range.end),
        text: virtual.text.slice(offsetAt(virtual.text, diagnostic.range.start), offsetAt(virtual.text, diagnostic.range.end)),
      };
      const sourceRange = virtual.map.toSourceRange(virtualRange);
      if (!sourceRange) continue;
      diagnostics.push({
        range: Range.create(positionAt(document.text, sourceRange.start), positionAt(document.text, sourceRange.end)),
        message: diagnostic.message,
        severity: (diagnostic.severity ?? DiagnosticSeverity.Error) as DiagnosticSeverity,
        code: diagnostic.code === undefined ? undefined : String(diagnostic.code),
        source: 'cast-php',
      });
    }
    return diagnostics;
  }
}
