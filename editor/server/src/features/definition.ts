import {
  Definition,
  Location,
  Position,
  Range
} from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { camel } from 'cast-language-core';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { PropDefinition } from '../types.js';
import { nonComponentReferences } from '../index/references.js';

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

    // 2. Definition on Component tag <Btns.Soft>, or on one of its attributes (jump to the prop's own
    // declaration line in the component file, when CastParser tracked one - see ProjectIndex.indexFile).
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

      for (const attr of comp.attributes) {
        if (!attr.name || !this.positionInRange(position, attr.nameRange)) continue;
        const meta = this.projectIndex.getComponent(comp.name);
        if (!meta) continue;
        const prop = this.findProp(meta.props, attr.name);
        if (prop?.range) {
          return Location.create(URI.file(meta.fsPath).toString(), prop.range);
        }
      }
    }

    // 3. Legacy Component()/view()/module() references
    for (const ref of nonComponentReferences(doc, this.projectIndex)) {
      if (ref.file && this.positionInRange(position, ref.range)) {
        return Location.create(URI.file(ref.file).toString(), Range.create(0, 0, 0, 0));
      }
    }

    return null;
  }

  /** The documented prop for an attribute name, matching the engine's camelCasing (`has-label` is `hasLabel`). */
  private findProp(props: Map<string, PropDefinition>, attributeName: string): PropDefinition | null {
    const wanted = camel(attributeName);
    for (const prop of props.values()) {
      if (prop.name === attributeName || camel(prop.name) === wanted) return prop;
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
