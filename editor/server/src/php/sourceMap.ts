import { Position, Range } from 'vscode-languageserver';

export interface SourceMapping {
  castRange: Range;
  virtualRange: Range;
}

export class SourceMap {
  private mappings: SourceMapping[] = [];

  public addMapping(castRange: Range, virtualRange: Range): void {
    this.mappings.push({ castRange, virtualRange });
  }

  public toCastPosition(virtualPos: Position): Position | null {
    for (const m of this.mappings) {
      if (
        virtualPos.line >= m.virtualRange.start.line &&
        virtualPos.line <= m.virtualRange.end.line
      ) {
        // Line delta
        const lineOffset = virtualPos.line - m.virtualRange.start.line;
        const targetLine = m.castRange.start.line + lineOffset;

        // Character calculation
        let targetChar = m.castRange.start.character;
        if (lineOffset === 0) {
          targetChar += (virtualPos.character - m.virtualRange.start.character);
        } else {
          targetChar = virtualPos.character;
        }

        return { line: targetLine, character: targetChar };
      }
    }
    return null;
  }

  public toVirtualPosition(castPos: Position): Position | null {
    for (const m of this.mappings) {
      if (
        castPos.line >= m.castRange.start.line &&
        castPos.line <= m.castRange.end.line
      ) {
        const lineOffset = castPos.line - m.castRange.start.line;
        const targetLine = m.virtualRange.start.line + lineOffset;

        let targetChar = m.virtualRange.start.character;
        if (lineOffset === 0) {
          targetChar += (castPos.character - m.castRange.start.character);
        } else {
          targetChar = castPos.character;
        }

        return { line: targetLine, character: targetChar };
      }
    }
    return null;
  }
}
