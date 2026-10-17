import {
  CompletionItem,
  CompletionList,
  Hover,
  Location,
  LocationLink,
  Position,
  Range,
  SignatureHelp,
  TextEdit,
} from 'vscode-languageserver';
import { analyzeCast, buildPhpVirtual, VirtualPhpDocument } from 'cast-language-core';
import { CastDocument } from '../parser/ast.js';

export interface PhpLanguageClient {
  synchronize(virtual: VirtualPhpDocument, version?: number): Promise<unknown>;
  request<T>(method: string, params: unknown): Promise<T | null>;
}

type PhpDefinition = Location | Location[] | LocationLink[];

interface PhpTarget {
  virtual: VirtualPhpDocument;
  sourceOffset: number;
  virtualOffset: number;
}

function offsetAt(text: string, position: Position): number {
  let lineStart = 0;
  for (let line = 0; line < position.line; line += 1) {
    const newline = text.indexOf('\n', lineStart);
    if (newline === -1) return text.length;
    lineStart = newline + 1;
  }
  return Math.min(lineStart + position.character, text.length);
}

function positionAt(text: string, offset: number): Position {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, clamped);
  return { line: (prefix.match(/\n/g) ?? []).length, character: clamped - prefix.lastIndexOf('\n') - 1 };
}

/** Routes only embedded-PHP positions to Phpactor, then translates result ranges home. */
export class PhpDelegation {
  constructor(private readonly client: PhpLanguageClient) {}

  public async hover(document: CastDocument, position: Position): Promise<Hover | null> {
    const target = await this.targetAt(document, position);
    if (!target) return null;
    const result = await this.client.request<Hover>('textDocument/hover', this.requestParams(target));
    return result ? { ...result, range: result.range ? this.toSourceRange(document, target, result.range) ?? undefined : undefined } : null;
  }

  public async completion(document: CastDocument, position: Position): Promise<CompletionItem[] | CompletionList | null> {
    const target = await this.targetAt(document, position);
    if (!target) return null;
    const result = await this.client.request<CompletionItem[] | CompletionList>('textDocument/completion', this.requestParams(target));
    if (!result) return null;
    const items = Array.isArray(result) ? result : result.items;
    const mapped = items.map((item) => this.mapCompletion(document, target, item));
    return Array.isArray(result) ? mapped : { ...result, items: mapped };
  }

  public async definition(document: CastDocument, position: Position): Promise<PhpDefinition | null> {
    const target = await this.targetAt(document, position);
    if (!target) return null;
    const result = await this.client.request<PhpDefinition>('textDocument/definition', this.requestParams(target));
    if (!result) return null;
    const mapOne = (location: Location | LocationLink): Location | LocationLink => this.mapLocation(document, target, location);
    return Array.isArray(result) ? (result.map(mapOne) as Location[] | LocationLink[]) : (mapOne(result) as Location);
  }

  public async signatureHelp(document: CastDocument, position: Position): Promise<SignatureHelp | null> {
    const target = await this.targetAt(document, position);
    return target ? this.client.request<SignatureHelp>('textDocument/signatureHelp', this.requestParams(target)) : null;
  }

  private async targetAt(document: CastDocument, position: Position): Promise<PhpTarget | null> {
    const sourceOffset = offsetAt(document.text, position);
    const analysis = analyzeCast(document.text);
    const region = analysis.regions.find((candidate) => candidate.kind === 'php' && sourceOffset >= candidate.range.start && sourceOffset <= candidate.range.end);
    if (!region) return null;
    const virtual = buildPhpVirtual(document.uri, analysis);
    const virtualOffset = virtual.map.toVirtualOffset(sourceOffset);
    if (virtualOffset === null) return null;
    await this.client.synchronize(virtual, document.version);
    return { virtual, sourceOffset, virtualOffset };
  }

  private requestParams(target: PhpTarget): { textDocument: { uri: string }; position: Position } {
    return { textDocument: { uri: target.virtual.uri }, position: positionAt(target.virtual.text, target.virtualOffset) };
  }

  private toSourceRange(document: CastDocument, target: PhpTarget, range: Range): Range | null {
    const virtualStart = offsetAt(target.virtual.text, range.start);
    const virtualEnd = offsetAt(target.virtual.text, range.end);
    const mapped = target.virtual.map.toSourceRange({ start: virtualStart, end: virtualEnd, text: target.virtual.text.slice(virtualStart, virtualEnd) });
    return mapped ? Range.create(positionAt(document.text, mapped.start), positionAt(document.text, mapped.end)) : null;
  }

  private mapCompletion(document: CastDocument, target: PhpTarget, item: CompletionItem): CompletionItem {
    const mapEdit = (edit: TextEdit): TextEdit => ({ ...edit, range: this.toSourceRange(document, target, edit.range) ?? edit.range });
    const textEdit = item.textEdit
      ? 'range' in item.textEdit ? mapEdit(item.textEdit) : item.textEdit
      : undefined;
    return { ...item, textEdit, additionalTextEdits: item.additionalTextEdits?.map(mapEdit) };
  }

  private mapLocation(document: CastDocument, target: PhpTarget, location: Location | LocationLink): Location | LocationLink {
    const uri = 'targetUri' in location ? location.targetUri : location.uri;
    if (uri !== target.virtual.uri) return location;
    if ('targetUri' in location) {
      const targetRange = this.toSourceRange(document, target, location.targetRange);
      const targetSelectionRange = this.toSourceRange(document, target, location.targetSelectionRange);
      return targetRange && targetSelectionRange
        ? { ...location, targetUri: document.uri, targetRange, targetSelectionRange }
        : location;
    }
    const range = this.toSourceRange(document, target, location.range);
    return range ? Location.create(document.uri, range) : location;
  }
}
