import {
  Hover,
  MarkupKind,
  Position
} from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { getCastSyntaxSpec } from '../syntaxSpec.js';

export class HoverProvider {
  private syntax = getCastSyntaxSpec();

  constructor(private projectIndex: ProjectIndex) {}

  public getHover(doc: CastDocument, position: Position): Hover | null {
    // 1. Hover on Component tag
    for (const comp of doc.components) {
      if (this.positionInRange(position, comp.nameRange)) {
        return this.getComponentHover(comp.name);
      }

      // Hover on Component attribute
      for (const attr of comp.attributes) {
        if (this.positionInRange(position, attr.nameRange)) {
          return this.getAttributeHover(comp.name, attr.name);
        }
      }
    }

    // 2. Hover on Directive
    for (const d of doc.directives) {
      if (this.positionInRange(position, d.nameRange)) {
        return this.getDirectiveHover(d.name);
      }
    }

    // 3. Hover on @props entry
    if (doc.propsBlock) {
      for (const entry of doc.propsBlock.entries) {
        if (this.positionInRange(position, entry.nameRange) || this.positionInRange(position, entry.typeRange)) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: `**Prop \`$${entry.name}\`**\n\n- **Type:** \`${entry.type}\`\n- **Nullable:** \`${entry.isNullable}\`\n- **Required:** \`${entry.isRequired}\`${entry.defaultValue !== undefined ? `\n- **Default:** \`${entry.defaultValue}\`` : ''}`
            }
          };
        }
      }
    }

    return null;
  }

  private getComponentHover(tag: string): Hover | null {
    const meta = this.projectIndex.getComponent(tag);
    if (!meta) return null;

    const fwBadge = meta.isFramework ? ' `(framework)`' : '';
    let md = `### <${meta.tag} />${fwBadge}\n\n`;
    if (meta.description) {
      md += `${meta.description}\n\n`;
    }
    md += `*Defined in [${meta.relativePath}]*\n\n`;

    if (meta.extends) {
      md += `*Extends:* \`${meta.extends}\`\n\n`;
    }

    if (meta.props.size > 0) {
      md += `#### Declared Props:\n`;
      md += `| Prop | Type | Default | Required |\n`;
      md += `|---|---|---|---|\n`;
      for (const [name, p] of meta.props.entries()) {
        const def = p.defaultValue !== undefined ? `\`${p.defaultValue}\`` : '—';
        const req = p.isRequired ? '✅ Yes' : 'No';
        md += `| \`${name}\` | \`${p.type}\` | ${def} | ${req} |\n`;
      }
      md += '\n';
    }

    if (meta.slots.length > 0) {
      md += `#### Slots:\n`;
      for (const slot of meta.slots) {
        md += `- \`<Slot name="${slot}">\`\n`;
      }
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: md
      }
    };
  }

  private getAttributeHover(tag: string, attrName: string): Hover | null {
    const meta = this.projectIndex.getComponent(tag);
    if (!meta) return null;

    const prop = meta.props.get(attrName);
    if (!prop) return null;

    let md = `**Prop \`${attrName}\`** on \`<${tag}>\`\n\n`;
    md += `- **Type:** \`${prop.type}\`\n`;
    md += `- **Required:** \`${prop.isRequired ? 'Yes' : 'No'}\`\n`;
    if (prop.defaultValue !== undefined) {
      md += `- **Default:** \`${prop.defaultValue}\`\n`;
    }
    if (prop.description) {
      md += `\n${prop.description}\n`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: md
      }
    };
  }

  private getDirectiveHover(name: string): Hover | null {
    // Check blocks
    for (const [key, block] of Object.entries(this.syntax.blocks)) {
      if (block.open === `@${name}` || block.close === `@${name}` || block.intermediates.includes(`@${name}`)) {
        let md = `**Cast Directive: \`@${name}\`**\n\n${block.description}\n\n`;
        md += `\`\`\`cast\n${block.open} ... ${block.close}\n\`\`\``;
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: md
          }
        };
      }
    }

    if (name === 'props') {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**Cast Directive: \`@props\`**\n\n${this.syntax.props.syntax}\n\nInheritance: \`${this.syntax.props.inheritanceSyntax}\`\n\nSupported types: ${this.syntax.props.supportedTypes.join(', ')}`
        }
      };
    }

    if (name === 'css') {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**Cast Directive: \`@css\`**\n\nComponent-scoped CSS with automatic class name hash isolation.\n\n\`\`\`css\n@css(\n  .container { display: flex; }\n)\n\`\`\``
        }
      };
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
