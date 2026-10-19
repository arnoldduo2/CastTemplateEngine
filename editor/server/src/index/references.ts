import { Position, Range } from 'vscode-languageserver';
import { scanHelpers } from 'cast-language-core';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from './projectIndex.js';

export interface NonComponentReference {
  kind: 'legacy-component' | 'view' | 'module';
  range: Range;
  file: string | null;
}

function positionAt(text: string, offset: number): Position {
  const lines = text.slice(0, offset).split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

function rangeAt(text: string, start: number, end: number): Range {
  return { start: positionAt(text, start), end: positionAt(text, end) };
}

/**
 * Legacy `Component('btns.add-new')`/`__includes('layouts.header')`/`__modules('app', 'css')` references, resolved
 * through the same settings-aware paths component tags already use. Shared by DefinitionProvider and
 * DocumentLinksProvider so the scan-and-resolve loop isn't duplicated in both.
 */
export function nonComponentReferences(doc: CastDocument, projectIndex: ProjectIndex): NonComponentReference[] {
  return scanHelpers(doc.text).map((ref) => {
    const resolved =
      ref.kind === 'view' ? projectIndex.resolveView(ref.name)
      : ref.kind === 'legacy-component' ? projectIndex.resolveLegacyComponent(ref.name)
      : projectIndex.resolveModule(ref.name, ref.type === 'css' ? 'css' : 'js');
    return { kind: ref.kind, range: rangeAt(doc.text, ref.start, ref.end), file: resolved.file };
  });
}
