import {
  Definition,
  Location,
  Position,
  Range
} from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';

export class DefinitionProvider {
  constructor(private projectIndex: ProjectIndex) {}

  public getDefinition(doc: CastDocument, position: Position): Definition | null {
    // 1. Definition for extends::Component.Path
    if (doc.propsBlock && doc.propsBlock.extendsTarget && doc.propsBlock.extendsRange) {
      if (this.positionInRange(position, doc.propsBlock.extendsRange)) {
        const meta = this.projectIndex.getComponent(doc.propsBlock.extendsTarget);
        if (meta) {
          return Location.create(
            URI.file(meta.fsPath).toString(),
            Range.create(0, 0, 0, 0)
          );
        }
      }
    }

    // 2. Definition on Component tag <Btns.Soft>
    for (const comp of doc.components) {
      if (this.positionInRange(position, comp.nameRange)) {
        const meta = this.projectIndex.getComponent(comp.name);
        if (meta) {
          return Location.create(
            URI.file(meta.fsPath).toString(),
            Range.create(0, 0, 0, 0)
          );
        }
      }
    }

    return null;
  }

  private positionInRange(pos: Position, range: any): boolean {
    if (!range) return false;
    if (pos.line < range.start.line || pos.line > range.end.line) return false;
    if (pos.line === range.start.line && pos.character < range.start.character) return false;
    if (pos.line === range.end.line && pos.character > range.end.character) return false;
    return true;
  }
}
