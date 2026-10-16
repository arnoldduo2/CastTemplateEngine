import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position
} from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { getCastSyntaxSpec } from '../syntaxSpec.js';

export class CompletionProvider {
  private syntax = getCastSyntaxSpec();

  constructor(private projectIndex: ProjectIndex) {}

  public getCompletions(doc: CastDocument, position: Position): CompletionItem[] {
    const lineText = doc.text.split('\n')[position.line] || '';
    const prefix = lineText.substring(0, position.character);

    // 1. Inside @props extends::
    if (/@props\s+extends::[A-Za-z0-9_.]*$/.test(prefix)) {
      return this.getExtendsCompletions();
    }

    // 2. Directives (prefix starts with @)
    if (/@([a-zA-Z0-9_]*)$/.test(prefix)) {
      return this.getDirectiveCompletions();
    }

    // 3. Inside a Component tag (attributes completion)
    const tagContext = this.findComponentTagContext(doc, position);
    if (tagContext) {
      return this.getAttributeCompletions(tagContext);
    }

    // 4. Tags completion (<...)
    if (/<([A-Za-z0-9_.]*)$/.test(prefix)) {
      return this.getComponentTagCompletions();
    }

    return [];
  }

  private getDirectiveCompletions(): CompletionItem[] {
    const items: CompletionItem[] = [];

    // Blocks
    for (const [key, block] of Object.entries(this.syntax.blocks)) {
      let snippet = `${block.open}`;
      if (block.hasArgs) snippet += ` (\${1:condition})\n\t$0\n${block.close}`;
      else snippet += `\n\t$0\n${block.close}`;

      items.push({
        label: block.open,
        kind: CompletionItemKind.Keyword,
        detail: `Cast block: ${key}`,
        documentation: block.description,
        insertText: snippet,
        insertTextFormat: InsertTextFormat.Snippet
      });
    }

    // Loop control & assets
    items.push(
      {
        label: '@props',
        kind: CompletionItemKind.Keyword,
        detail: '@props{ type $name; }',
        documentation: 'Declare strictly typed component props with optional defaults.',
        insertText: '@props {\n\t${1:string} \\$${2:name};\n}',
        insertTextFormat: InsertTextFormat.Snippet
      },
      {
        label: '@css',
        kind: CompletionItemKind.Function,
        detail: '@css(...)',
        documentation: 'Component-scoped CSS with automatic class isolation.',
        insertText: '@css(\n\t.$1 {\n\t\t$0\n\t}\n)',
        insertTextFormat: InsertTextFormat.Snippet
      },
      {
        label: '@script',
        kind: CompletionItemKind.Function,
        detail: '@script(...)',
        documentation: 'Component-scoped JavaScript registration.',
        insertText: '@script(\n\t$0\n)',
        insertTextFormat: InsertTextFormat.Snippet
      },
      {
        label: '@csrf',
        kind: CompletionItemKind.Function,
        detail: '@csrf',
        documentation: 'Renders CSRF hidden token field.',
        insertText: '@csrf'
      },
      {
        label: '@styles',
        kind: CompletionItemKind.Function,
        detail: '@styles',
        documentation: 'Renders component stylesheet bundle in layout head.',
        insertText: '@styles'
      },
      {
        label: '@scripts',
        kind: CompletionItemKind.Function,
        detail: '@scripts',
        documentation: 'Renders component script bundle before body close.',
        insertText: '@scripts'
      }
    );

    return items;
  }

  private getComponentTagCompletions(): CompletionItem[] {
    const items: CompletionItem[] = [];
    const components = this.projectIndex.getAllComponents();

    for (const comp of components) {
      // Build snippet including required props
      let snippet = `${comp.tag}`;
      let propIndex = 1;
      for (const [pName, pDef] of comp.props.entries()) {
        if (pDef.isRequired) {
          snippet += ` ${pName}="\${${propIndex}:${pDef.defaultValue ?? pName}}"`;
          propIndex++;
        }
      }
      snippet += ` />$0`;

      const frameworkTag = comp.isFramework ? ' (framework)' : '';
      items.push({
        label: comp.tag,
        kind: CompletionItemKind.Class,
        detail: `<${comp.tag} />${frameworkTag}`,
        documentation: comp.description || `Component from ${comp.relativePath}`,
        insertText: snippet,
        insertTextFormat: InsertTextFormat.Snippet
      });
    }

    // Slot tag
    items.push({
      label: 'Slot',
      kind: CompletionItemKind.Class,
      detail: '<Slot name="..." />',
      documentation: 'Inject content into a named component prop.',
      insertText: 'Slot name="${1:name}">\n\t$0\n</Slot>',
      insertTextFormat: InsertTextFormat.Snippet
    });

    return items;
  }

  private getAttributeCompletions(tag: string): CompletionItem[] {
    const meta = this.projectIndex.getComponent(tag);
    if (!meta) return [];

    const items: CompletionItem[] = [];
    for (const [name, prop] of meta.props.entries()) {
      const isString = prop.type.includes('string');
      const snippet = isString ? `${name}="\${1:${prop.defaultValue ?? ''}}"$0` : `${name}={\${1:${prop.defaultValue ?? ''}}}$0`;

      items.push({
        label: name,
        kind: CompletionItemKind.Property,
        detail: `${prop.type}${prop.isRequired ? ' (required)' : ''}`,
        documentation: prop.description || (prop.defaultValue !== undefined ? `Default: ${prop.defaultValue}` : undefined),
        insertText: snippet,
        insertTextFormat: InsertTextFormat.Snippet
      });
    }

    return items;
  }

  private getExtendsCompletions(): CompletionItem[] {
    const items: CompletionItem[] = [];
    for (const comp of this.projectIndex.getAllComponents()) {
      items.push({
        label: comp.tag,
        kind: CompletionItemKind.Class,
        detail: comp.relativePath,
        documentation: `Inherit @props from ${comp.tag}`
      });
    }
    return items;
  }

  private findComponentTagContext(doc: CastDocument, position: Position): string | null {
    for (const comp of doc.components) {
      if (
        !comp.isClosing &&
        comp.range.start.line <= position.line &&
        comp.range.end.line >= position.line
      ) {
        return comp.name;
      }
    }
    return null;
  }
}
