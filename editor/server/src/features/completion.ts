import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
  Range,
  TextEdit
} from 'vscode-languageserver';
import { camel, contextAt, spell } from 'cast-language-core';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { PropDefinition } from '../types.js';
import { getCastSyntaxSpec } from '../syntaxSpec.js';
import { CastSettings, DEFAULT_SETTINGS } from '../settings.js';

export class CompletionProvider {
  private syntax = getCastSyntaxSpec();
  private settings: CastSettings = DEFAULT_SETTINGS;

  constructor(private projectIndex: ProjectIndex) {}

  /** The resolved cast.* settings (propCase, for attribute-name spelling) - see server.ts's onDidChangeConfiguration. */
  public setSettings(settings: CastSettings): void {
    this.settings = settings;
  }

  public getCompletions(doc: CastDocument, position: Position): CompletionItem[] {
    const lineText = doc.text.split('\n')[position.line] || '';
    const prefix = lineText.substring(0, position.character);

    // 1. Inside @props extends::
    if (/@props\s+extends::[A-Za-z0-9_.]*$/.test(prefix)) {
      return this.getExtendsCompletions();
    }

    // 2. Directives (prefix starts with @)
    const directiveMatch = /@([a-zA-Z0-9_]*)$/.exec(prefix);
    if (directiveMatch) {
      const range = Range.create(position.line, prefix.length - directiveMatch[0].length, position.line, position.character);
      return this.getDirectiveCompletions(range);
    }

    // 3. Component-tag-adjacent: tag name, attribute name, attribute value, or <Slot name="...">. One shared
    // "what is being typed" scan (contextAt, cast-language-core) instead of two separate heuristics, so the LSP
    // never drifts from the extension's own completion behavior - see Task 8 of the Cast LSP Precedence plan.
    const offset = this.offsetAt(doc.text, position);
    const context = contextAt(doc.text, offset);
    if (!context) return [];

    const range = (a: number, b: number) => Range.create(this.positionAt(doc.text, a), this.positionAt(doc.text, b));

    if (context.type === 'tag') {
      return this.getComponentTagCompletions(range(context.start, context.end));
    }
    if (context.type === 'slot') {
      const parent = context.parent ? this.projectIndex.getComponent(context.parent.name) : undefined;
      return (parent?.slots ?? []).map((slot) => ({
        label: slot.name,
        kind: CompletionItemKind.Field,
        detail: slot.description,
        textEdit: TextEdit.replace(range(context.start, context.end), slot.name)
      }));
    }
    if (context.type === 'attribute') {
      return this.getAttributeCompletions(context.ref.name, context.used, range(context.start, context.end));
    }
    if (context.type === 'value' && context.attr.name) {
      return this.getValueCompletions(context.ref.name, context.attr.name, context.quoted, range(context.start, context.end));
    }
    return [];
  }

  private offsetAt(text: string, position: Position): number {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < position.line; i++) offset += lines[i].length + 1;
    return offset + position.character;
  }

  private positionAt(text: string, offset: number): Position {
    const prefix = text.slice(0, offset);
    const lines = prefix.split('\n');
    return { line: lines.length - 1, character: lines[lines.length - 1].length };
  }

  private getDirectiveCompletions(range: Range): CompletionItem[] {
    const items: CompletionItem[] = [];
    const snippet = (newText: string): TextEdit => TextEdit.replace(range, newText);

    // Blocks
    for (const [key, block] of Object.entries(this.syntax.blocks)) {
      let newText = `${block.open}`;
      if (block.hasArgs) newText += ` (\${1:condition})\n\t$0\n${block.close}`;
      else newText += `\n\t$0\n${block.close}`;

      items.push({
        label: block.open,
        kind: CompletionItemKind.Keyword,
        detail: `Cast block: ${key}`,
        documentation: block.description,
        textEdit: snippet(newText),
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
        textEdit: snippet('@props {\n\t${1:string} \\$${2:name};\n}'),
        insertTextFormat: InsertTextFormat.Snippet
      },
      {
        label: '@css',
        kind: CompletionItemKind.Function,
        detail: '@css(...)',
        documentation: 'Component-scoped CSS with automatic class isolation.',
        textEdit: snippet('@css(\n\t.$1 {\n\t\t$0\n\t}\n)'),
        insertTextFormat: InsertTextFormat.Snippet
      },
      {
        label: '@script',
        kind: CompletionItemKind.Function,
        detail: '@script(...)',
        documentation: 'Component-scoped JavaScript registration.',
        textEdit: snippet('@script(\n\t$0\n)'),
        insertTextFormat: InsertTextFormat.Snippet
      },
      {
        label: '@js',
        kind: CompletionItemKind.Function,
        detail: '@js(...)',
        documentation: 'Component-scoped JavaScript, rendered inline without a <script> wrapper.',
        textEdit: snippet('@js(\n\t$0\n)'),
        insertTextFormat: InsertTextFormat.Snippet
      },
      {
        label: '@{}',
        kind: CompletionItemKind.Function,
        detail: '@{ expression }',
        documentation: 'Echo interpolation for a PHP expression, equivalent to <?= ... ?>.',
        textEdit: snippet('@{ ${1:expression} }'),
        insertTextFormat: InsertTextFormat.Snippet
      },
      {
        label: '@csrf',
        kind: CompletionItemKind.Function,
        detail: '@csrf',
        documentation: 'Renders CSRF hidden token field.',
        textEdit: snippet('@csrf')
      },
      {
        label: '@styles',
        kind: CompletionItemKind.Function,
        detail: '@styles',
        documentation: 'Renders component stylesheet bundle in layout head.',
        textEdit: snippet('@styles')
      },
      {
        label: '@scripts',
        kind: CompletionItemKind.Function,
        detail: '@scripts',
        documentation: 'Renders component script bundle before body close.',
        textEdit: snippet('@scripts')
      }
    );

    return items;
  }

  private getComponentTagCompletions(range: Range): CompletionItem[] {
    const items: CompletionItem[] = [];
    const components = this.projectIndex.getAllComponents();

    for (const comp of components) {
      // Build snippet including required props
      let snippet = `${comp.tag}`;
      let propIndex = 1;
      for (const prop of comp.props.values()) {
        if (prop.isRequired) {
          const name = spell(prop.name, this.settings.propCase);
          const placeholder = `\${${propIndex}:${prop.defaultValue ?? prop.name}}`;
          // prop.kind-aware, matching extension.js's own tag-completion snippet: a string prop gets a quoted
          // placeholder, anything else (array/object/int/bool/other) gets a `{ }` expression placeholder instead -
          // `items="items"` for a required `array $items` is a string literal where the engine needs an
          // expression, and would silently fail at render time rather than at the completion the user just accepted.
          snippet += prop.kind === 'string' ? ` ${name}="${placeholder}"` : ` ${name}={${placeholder}}`;
          propIndex++;
        }
      }
      snippet += ' />$0';

      const frameworkTag = comp.isFramework ? ' (framework)' : '';
      items.push({
        label: comp.tag,
        kind: CompletionItemKind.Class,
        detail: `<${comp.tag} />${frameworkTag}`,
        documentation: comp.description || `Component from ${comp.relativePath}`,
        textEdit: TextEdit.replace(range, snippet),
        insertTextFormat: InsertTextFormat.Snippet
      });
    }

    // Slot tag
    items.push({
      label: 'Slot',
      kind: CompletionItemKind.Class,
      detail: '<Slot name="..." />',
      documentation: 'Inject content into a named component prop.',
      textEdit: TextEdit.replace(range, 'Slot name="${1:name}">\n\t$0\n</Slot>'),
      insertTextFormat: InsertTextFormat.Snippet
    });

    return items;
  }

  private getAttributeCompletions(tag: string, used: Set<string>, range: Range): CompletionItem[] {
    const meta = this.projectIndex.getComponent(tag);
    if (!meta) return [];

    const items: CompletionItem[] = [];
    for (const prop of meta.props.values()) {
      if (used.has(camel(prop.name))) continue;

      const name = spell(prop.name, this.settings.propCase);
      const kind = prop.kind ?? 'other';
      const values = prop.values ?? [];
      const placeholder = values.length ? `\${1|${values.join(',')}|}` : '$1';
      const snippet = kind === 'bool' ? name : kind === 'string' ? `${name}="${placeholder}"` : `${name}={$1}`;

      const item: CompletionItem = {
        label: name,
        kind: CompletionItemKind.Property,
        detail: [prop.type, prop.isRequired ? 'required' : prop.defaultValue !== undefined ? `default ${prop.defaultValue}` : 'optional'].filter(Boolean).join(' · '),
        documentation: prop.description,
        textEdit: TextEdit.replace(range, snippet),
        insertTextFormat: InsertTextFormat.Snippet
      };
      if (kind !== 'bool') item.command = { command: 'editor.action.triggerSuggest', title: 'values' };
      items.push(item);
    }

    return items;
  }

  private getValueCompletions(tag: string, attributeName: string, quoted: boolean, range: Range): CompletionItem[] {
    const meta = this.projectIndex.getComponent(tag);
    if (!meta) return [];
    const prop = this.findProp(meta.props, attributeName);
    if (!prop) return [];

    const kind = prop.kind ?? 'other';
    const values = kind === 'bool' ? ['true', 'false'] : prop.values ?? [];

    return values.map((value) => ({
      label: value,
      kind: CompletionItemKind.EnumMember,
      detail: prop.name,
      textEdit: TextEdit.replace(range, kind === 'bool' ? (quoted ? value : `{${value}}`) : quoted ? value : `"${value}"`)
    }));
  }

  /** The documented prop for an attribute name, matching the engine's camelCasing (`has-label` is `hasLabel`). */
  private findProp(props: Map<string, PropDefinition>, attributeName: string): PropDefinition | null {
    const wanted = camel(attributeName);
    for (const prop of props.values()) {
      if (prop.name === attributeName || camel(prop.name) === wanted) return prop;
    }
    return null;
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

}
