import { Position, Range, DiagnosticSeverity } from 'vscode-languageserver';
import {
  CastDocument,
  PropsBlockNode,
  PropEntryNode,
  ComponentNode,
  ComponentAttributeNode,
  DirectiveNode,
  EchoHoleNode,
  PhpTagNode,
  HtmlTagNode
} from './ast.js';
import { CastDiagnostic } from '../types.js';
import { getCastSyntaxSpec } from '../syntaxSpec.js';

export class CastParser {
  private text: string = '';
  private lineStarts: number[] = [];
  private syntax = getCastSyntaxSpec();

  public parse(uri: string, text: string, version: number = 1): CastDocument {
    this.text = text;
    this.computeLineStarts();

    const diagnostics: CastDiagnostic[] = [];
    const echoHoles = this.parseEchoHoles();
    const phpTags = this.parsePhpTags();
    const propsBlock = this.parsePropsBlock(diagnostics);
    const directives = this.parseDirectives(diagnostics);
    const components = this.parseComponents(diagnostics);

    // Validate block balancing
    this.validateBlockNesting(directives, diagnostics);
    this.validateComponentTags(components, diagnostics);

    return {
      uri,
      text,
      version,
      propsBlock,
      components,
      directives,
      echoHoles,
      phpTags,
      htmlTags: [],
      diagnostics
    };
  }

  // --- Line starts and position mapping ---

  private computeLineStarts(): void {
    this.lineStarts = [0];
    for (let i = 0; i < this.text.length; i++) {
      if (this.text[i] === '\n') {
        this.lineStarts.push(i + 1);
      }
    }
  }

  public positionAt(offset: number): Position {
    offset = Math.max(0, Math.min(offset, this.text.length));
    let low = 0;
    let high = this.lineStarts.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.lineStarts[mid] > offset) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const line = high;
    const character = offset - this.lineStarts[line];
    return { line, character };
  }

  public offsetAt(position: Position): number {
    if (position.line >= this.lineStarts.length) {
      return this.text.length;
    }
    const lineStart = this.lineStarts[position.line];
    return Math.min(lineStart + position.character, this.text.length);
  }

  public createRange(startOffset: number, endOffset: number): Range {
    return {
      start: this.positionAt(startOffset),
      end: this.positionAt(endOffset)
    };
  }

  // --- Props Block Parsing ---

  private parsePropsBlock(diagnostics: CastDiagnostic[]): PropsBlockNode | undefined {
    // Match @props, optional extends::Component.Path, and { ... }
    const propsRegex = /@props(?:\s+extends::([A-Z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*))?\s*\{/g;
    const match = propsRegex.exec(this.text);
    if (!match) return undefined;

    const startOffset = match.index;
    const extendsTarget = match[1];
    let extendsRange: Range | undefined;

    if (extendsTarget) {
      const extendsStart = match[0].indexOf('extends::') + startOffset;
      extendsRange = this.createRange(extendsStart, extendsStart + 'extends::'.length + extendsTarget.length);
    }

    // Find closing brace of props block
    let braceCount = 1;
    let endOffset = -1;
    let pos = match.index + match[0].length;

    while (pos < this.text.length) {
      const ch = this.text[pos];
      if (ch === '{') braceCount++;
      else if (ch === '}') {
        braceCount--;
        if (braceCount === 0) {
          endOffset = pos + 1;
          break;
        }
      }
      pos++;
    }

    if (endOffset === -1) {
      diagnostics.push({
        range: this.createRange(startOffset, match.index + match[0].length),
        message: 'Unclosed @props block. Expected matching "}"',
        severity: DiagnosticSeverity.Error
      });
      return undefined;
    }

    // Check if any HTML markup precedes this block
    const prefix = this.text.substring(0, startOffset).trim();
    if (/<[a-zA-Z]/i.test(prefix)) {
      diagnostics.push({
        range: this.createRange(startOffset, startOffset + '@props'.length),
        message: '@props must be declared before any HTML markup in component views.',
        severity: DiagnosticSeverity.Error
      });
    }

    const innerContent = this.text.substring(match.index + match[0].length, endOffset - 1);
    const contentStartOffset = match.index + match[0].length;
    const entries: PropEntryNode[] = [];

    // Parse entries: type $name [ = default ];
    // Strip inline single-line comments // ...
    const lines = innerContent.split('\n');
    let lineOffset = contentStartOffset;

    for (const rawLine of lines) {
      // Keep track of characters
      const cleanLine = rawLine.replace(/\/\/.*$/, ''); // strip comments
      const trimmed = cleanLine.trim();

      if (trimmed.length > 0) {
        // e.g. "?string $title = 'default';"
        const entryMatch = /^(\??[a-zA-Z0-9_|]+)\s+(\$[a-zA-Z0-9_]+)(?:\s*=\s*(.+?))?\s*;/.exec(trimmed);
        if (entryMatch) {
          const type = entryMatch[1];
          const name = entryMatch[2].substring(1); // strip $
          const defaultValue = entryMatch[3] ? entryMatch[3].trim() : undefined;
          const isNullable = type.startsWith('?') || type.includes('null');
          const isRequired = defaultValue === undefined && !isNullable;

          const lineIdx = rawLine.indexOf(entryMatch[0]);
          const entryStart = lineOffset + (lineIdx >= 0 ? lineIdx : 0);
          const typeStart = entryStart;
          const typeEnd = typeStart + type.length;
          const nameIdx = rawLine.indexOf(entryMatch[2], type.length);
          const nameStart = lineOffset + (nameIdx >= 0 ? nameIdx : type.length + 1);
          const nameEnd = nameStart + entryMatch[2].length;

          entries.push({
            name,
            type,
            isNullable,
            isRequired,
            defaultValue,
            range: this.createRange(entryStart, entryStart + entryMatch[0].length),
            typeRange: this.createRange(typeStart, typeEnd),
            nameRange: this.createRange(nameStart, nameEnd)
          });
        }
      }
      lineOffset += rawLine.length + 1; // +1 for \n
    }

    return {
      range: this.createRange(startOffset, endOffset),
      extendsTarget,
      extendsRange,
      entries,
      rawText: this.text.substring(startOffset, endOffset)
    };
  }

  // --- Echo Holes @{ ... } ---

  private parseEchoHoles(): EchoHoleNode[] {
    const holes: EchoHoleNode[] = [];
    let pos = 0;

    while (pos < this.text.length) {
      const idx = this.text.indexOf('@{', pos);
      if (idx === -1) break;

      // Find matching }
      let braceCount = 1;
      let endPos = idx + 2;
      while (endPos < this.text.length && braceCount > 0) {
        if (this.text[endPos] === '{') braceCount++;
        else if (this.text[endPos] === '}') braceCount--;
        endPos++;
      }

      if (braceCount === 0) {
        const rawExpr = this.text.substring(idx + 2, endPos - 1);
        const leadingSpace = rawExpr.search(/\S/);
        const trimmed = rawExpr.trim();
        const startOffset = idx + 2 + (leadingSpace >= 0 ? leadingSpace : 0);
        const endOffset = startOffset + trimmed.length;

        holes.push({
          range: this.createRange(idx, endPos),
          expression: trimmed,
          expressionRange: this.createRange(startOffset, endOffset)
        });
        pos = endPos;
      } else {
        pos = idx + 2;
      }
    }

    return holes;
  }

  // --- PHP Tags ---

  private parsePhpTags(): PhpTagNode[] {
    const tags: PhpTagNode[] = [];
    const phpRegex = /<\?(=|php)?([\s\S]*?)\?>/gi;
    let match: RegExpExecArray | null;

    while ((match = phpRegex.exec(this.text)) !== null) {
      const isEcho = match[1] === '=';
      tags.push({
        range: this.createRange(match.index, match.index + match[0].length),
        code: match[2],
        isEcho
      });
    }

    return tags;
  }

  // --- Directives ---

  private parseDirectives(diagnostics: CastDiagnostic[]): DirectiveNode[] {
    const directives: DirectiveNode[] = [];
    // Directive words regex
    const directiveRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\(([\s\S]*?)\))?/g;
    let match: RegExpExecArray | null;

    const blockStarts = new Set(['if', 'unless', 'isset', 'for', 'foreach', 'forelse', 'while', 'switch', 'php']);
    const blockEnds = new Set(['endif', 'endunless', 'endisset', 'endfor', 'endforeach', 'endforelse', 'endwhile', 'endswitch', 'endphp']);
    const intermediates = new Set(['elseif', 'else', 'empty', 'case', 'default']);

    while ((match = directiveRegex.exec(this.text)) !== null) {
      const name = match[1];
      const hasParens = match[0].includes('(');
      let args = match[2];
      let endOffset = match.index + match[0].length;

      // Handle properly balanced parentheses in case regex was too greedy or stopped early
      if (hasParens) {
        const openParenIdx = match.index + match[0].indexOf('(');
        let depth = 1;
        let p = openParenIdx + 1;
        while (p < this.text.length && depth > 0) {
          if (this.text[p] === '(') depth++;
          else if (this.text[p] === ')') depth--;
          p++;
        }
        if (depth === 0) {
          endOffset = p;
          args = this.text.substring(openParenIdx + 1, p - 1);
        }
      }

      const isBlockStart = blockStarts.has(name) && !(name === 'php' && hasParens);
      const isBlockEnd = blockEnds.has(name);
      const isIntermediate = intermediates.has(name);

      let blockType: string | undefined;
      if (name.startsWith('end')) {
        blockType = name.substring(3);
      } else if (isBlockStart) {
        blockType = name;
      } else if (isIntermediate) {
        if (name === 'elseif' || name === 'else') blockType = 'if';
        else if (name === 'empty') blockType = 'forelse';
        else if (name === 'case' || name === 'default') blockType = 'switch';
      }

      directives.push({
        range: this.createRange(match.index, endOffset),
        name,
        args,
        argsRange: args !== undefined ? this.createRange(match.index + match[0].indexOf('(') + 1, endOffset - 1) : undefined,
        isBlockStart,
        isBlockEnd,
        isIntermediate,
        blockType
      });
    }

    return directives;
  }

  // --- Components ---

  private parseComponents(diagnostics: CastDiagnostic[]): ComponentNode[] {
    const components: ComponentNode[] = [];
    const compRegex = /<(\/?)(Slot|[A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)*)([\s\S]*?)(\/?)>/g;
    let match: RegExpExecArray | null;

    while ((match = compRegex.exec(this.text)) !== null) {
      const isClosing = match[1] === '/';
      const name = match[2];
      const rawAttrs = match[3];
      const isSelfClosing = match[4] === '/' || isClosing;
      const startOffset = match.index;
      const endOffset = match.index + match[0].length;

      const nameStart = startOffset + (isClosing ? 2 : 1);
      const nameEnd = nameStart + name.length;
      const nameRange = this.createRange(nameStart, nameEnd);

      const attributes: ComponentAttributeNode[] = [];
      if (!isClosing && rawAttrs.trim().length > 0) {
        const attrOffsetBase = startOffset + 1 + name.length;
        this.parseAttributes(rawAttrs, attrOffsetBase, attributes);
      }

      components.push({
        range: this.createRange(startOffset, endOffset),
        name,
        isSelfClosing,
        isClosing,
        attributes,
        nameRange
      });
    }

    return components;
  }

  private parseAttributes(raw: string, baseOffset: number, out: ComponentAttributeNode[]): void {
    // Matches:
    // 1. Spread: {...$expr}
    // 2. Expression: prop={$expr}
    // 3. String: prop="value" or prop='value'
    // 4. Boolean: prop
    const regex = /\{\.\.\.([^}]+)\}|([:@a-zA-Z_][a-zA-Z0-9_\-:]*)(?:\s*=\s*(?:\{([^}]*)\}|"([^"]*)"|'([^']*)'))?/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(raw)) !== null) {
      const full = match[0];
      const attrStart = baseOffset + match.index;
      const attrEnd = attrStart + full.length;

      if (match[1]) {
        // Spread attribute {...$props}
        out.push({
          range: this.createRange(attrStart, attrEnd),
          name: '...',
          value: match[1].trim(),
          isExpression: true,
          isSpread: true,
          isBoolean: false,
          nameRange: this.createRange(attrStart + 1, attrStart + 4),
          valueRange: this.createRange(attrStart + 4, attrEnd - 1)
        });
      } else if (match[2]) {
        const name = match[2];
        const exprValue = match[3];
        const doubleQuoted = match[4];
        const singleQuoted = match[5];

        const isExpression = exprValue !== undefined;
        const isBoolean = !full.includes('=');
        const value = isExpression ? exprValue : (doubleQuoted !== undefined ? doubleQuoted : singleQuoted);

        const nameStart = attrStart;
        const nameEnd = nameStart + name.length;

        out.push({
          range: this.createRange(attrStart, attrEnd),
          name,
          value,
          isExpression,
          isSpread: false,
          isBoolean,
          nameRange: this.createRange(nameStart, nameEnd)
        });
      }
    }
  }

  // --- Validation ---

  private validateBlockNesting(directives: DirectiveNode[], diagnostics: CastDiagnostic[]): void {
    const stack: DirectiveNode[] = [];

    for (const d of directives) {
      if (d.isBlockStart) {
        stack.push(d);
      } else if (d.isBlockEnd) {
        if (stack.length === 0) {
          diagnostics.push({
            range: d.range,
            message: `Unexpected @${d.name} without matching opening directive`,
            severity: DiagnosticSeverity.Error
          });
        } else {
          const top = stack.pop()!;
          const expectedEnd = `end${top.name}`;
          if (d.name !== expectedEnd) {
            diagnostics.push({
              range: d.range,
              message: `Mismatched directive: expected @${expectedEnd}, got @${d.name}`,
              severity: DiagnosticSeverity.Error
            });
          }
        }
      } else if (d.isIntermediate) {
        if (stack.length === 0) {
          diagnostics.push({
            range: d.range,
            message: `Unexpected @${d.name} outside of conditional or loop block`,
            severity: DiagnosticSeverity.Error
          });
        }
      }
    }

    // Any remaining open directives
    while (stack.length > 0) {
      const unclosed = stack.pop()!;
      diagnostics.push({
        range: unclosed.range,
        message: `@${unclosed.name} is never closed (missing @end${unclosed.name})`,
        severity: DiagnosticSeverity.Error,
        fix: {
          title: `Insert @end${unclosed.name}`,
          newText: `\n@end${unclosed.name}\n`,
          range: this.createRange(this.text.length, this.text.length)
        }
      });
    }
  }

  private validateComponentTags(components: ComponentNode[], diagnostics: CastDiagnostic[]): void {
    const stack: ComponentNode[] = [];

    for (const comp of components) {
      if (comp.isSelfClosing && !comp.isClosing) {
        continue;
      }

      if (!comp.isClosing) {
        stack.push(comp);
      } else {
        if (stack.length === 0) {
          diagnostics.push({
            range: comp.range,
            message: `Unexpected closing tag </${comp.name}> without matching opening tag`,
            severity: DiagnosticSeverity.Error
          });
        } else {
          const top = stack.pop()!;
          if (top.name !== comp.name) {
            diagnostics.push({
              range: comp.range,
              message: `Mismatched tag: expected </${top.name}>, got </${comp.name}>`,
              severity: DiagnosticSeverity.Error
            });
          } else {
            top.pairedClosingTag = comp;
          }
        }
      }
    }

    while (stack.length > 0) {
      const unclosed = stack.pop()!;
      diagnostics.push({
        range: unclosed.range,
        message: `<${unclosed.name}> is never closed. Expected </${unclosed.name}>`,
        severity: DiagnosticSeverity.Error,
        fix: {
          title: `Close with </${unclosed.name}>`,
          newText: `</${unclosed.name}>`,
          range: this.createRange(this.text.length, this.text.length)
        }
      });
    }
  }
}
