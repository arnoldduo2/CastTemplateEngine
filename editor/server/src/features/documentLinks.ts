import {
  DocumentLink,
  Position
} from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';

export class DocumentLinksProvider {
  constructor(private projectIndex: ProjectIndex) {}

  public getDocumentLinks(doc: CastDocument): DocumentLink[] {
    const links: DocumentLink[] = [];

    // Link extends:: target
    if (doc.propsBlock && doc.propsBlock.extendsTarget && doc.propsBlock.extendsRange) {
      const meta = this.projectIndex.getComponent(doc.propsBlock.extendsTarget);
      if (meta) {
        links.push({
          range: doc.propsBlock.extendsRange,
          target: URI.file(meta.fsPath).toString(),
          tooltip: `Go to ${meta.relativePath}`
        });
      }
    }

    // Link component tags
    for (const comp of doc.components) {
      if (comp.isClosing || comp.name === 'Slot') continue;
      const meta = this.projectIndex.getComponent(comp.name);
      if (meta) {
        links.push({
          range: comp.nameRange,
          target: URI.file(meta.fsPath).toString(),
          tooltip: `Open <${comp.name} /> from ${meta.relativePath}`
        });
      }
    }

    return links;
  }
}
