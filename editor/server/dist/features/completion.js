"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionProvider = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
const cast_language_core_1 = require("cast-language-core");
const syntaxSpec_js_1 = require("../syntaxSpec.js");
const settings_js_1 = require("../settings.js");
class CompletionProvider {
    projectIndex;
    syntax = (0, syntaxSpec_js_1.getCastSyntaxSpec)();
    settings = settings_js_1.DEFAULT_SETTINGS;
    constructor(projectIndex) {
        this.projectIndex = projectIndex;
    }
    /** The resolved cast.* settings (propCase, for attribute-name spelling) - see server.ts's onDidChangeConfiguration. */
    setSettings(settings) {
        this.settings = settings;
    }
    getCompletions(doc, position) {
        const lineText = doc.text.split('\n')[position.line] || '';
        const prefix = lineText.substring(0, position.character);
        // 1. Inside @props extends::
        if (/@props\s+extends::[A-Za-z0-9_.]*$/.test(prefix)) {
            return this.getExtendsCompletions();
        }
        // 2. Directives (prefix starts with @)
        const directiveMatch = /@([a-zA-Z0-9_]*)$/.exec(prefix);
        if (directiveMatch) {
            const range = vscode_languageserver_1.Range.create(position.line, prefix.length - directiveMatch[0].length, position.line, position.character);
            return this.getDirectiveCompletions(range);
        }
        // 3. Component-tag-adjacent: tag name, attribute name, attribute value, or <Slot name="...">. One shared
        // "what is being typed" scan (contextAt, cast-language-core) instead of two separate heuristics, so the LSP
        // never drifts from the extension's own completion behavior - see Task 8 of the Cast LSP Precedence plan.
        const offset = this.offsetAt(doc.text, position);
        const context = (0, cast_language_core_1.contextAt)(doc.text, offset);
        if (!context)
            return [];
        const range = (a, b) => vscode_languageserver_1.Range.create(this.positionAt(doc.text, a), this.positionAt(doc.text, b));
        if (context.type === 'tag') {
            return this.getComponentTagCompletions(range(context.start, context.end));
        }
        if (context.type === 'slot') {
            const parent = context.parent ? this.projectIndex.getComponent(context.parent.name) : undefined;
            return (parent?.slots ?? []).map((slot) => ({
                label: slot.name,
                kind: vscode_languageserver_1.CompletionItemKind.Field,
                detail: slot.description,
                textEdit: vscode_languageserver_1.TextEdit.replace(range(context.start, context.end), slot.name)
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
    offsetAt(text, position) {
        const lines = text.split('\n');
        let offset = 0;
        for (let i = 0; i < position.line; i++)
            offset += lines[i].length + 1;
        return offset + position.character;
    }
    positionAt(text, offset) {
        const prefix = text.slice(0, offset);
        const lines = prefix.split('\n');
        return { line: lines.length - 1, character: lines[lines.length - 1].length };
    }
    getDirectiveCompletions(range) {
        const items = [];
        const snippet = (newText) => vscode_languageserver_1.TextEdit.replace(range, newText);
        // Blocks
        for (const [key, block] of Object.entries(this.syntax.blocks)) {
            let newText = `${block.open}`;
            if (block.hasArgs)
                newText += ` (\${1:condition})\n\t$0\n${block.close}`;
            else
                newText += `\n\t$0\n${block.close}`;
            items.push({
                label: block.open,
                kind: vscode_languageserver_1.CompletionItemKind.Keyword,
                detail: `Cast block: ${key}`,
                documentation: block.description,
                textEdit: snippet(newText),
                insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
            });
        }
        // Loop control & assets
        items.push({
            label: '@props',
            kind: vscode_languageserver_1.CompletionItemKind.Keyword,
            detail: '@props{ type $name; }',
            documentation: 'Declare strictly typed component props with optional defaults.',
            textEdit: snippet('@props {\n\t${1:string} \\$${2:name};\n}'),
            insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
        }, {
            label: '@css',
            kind: vscode_languageserver_1.CompletionItemKind.Function,
            detail: '@css(...)',
            documentation: 'Component-scoped CSS with automatic class isolation.',
            textEdit: snippet('@css(\n\t.$1 {\n\t\t$0\n\t}\n)'),
            insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
        }, {
            label: '@script',
            kind: vscode_languageserver_1.CompletionItemKind.Function,
            detail: '@script(...)',
            documentation: 'Component-scoped JavaScript registration.',
            textEdit: snippet('@script(\n\t$0\n)'),
            insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
        }, {
            label: '@js',
            kind: vscode_languageserver_1.CompletionItemKind.Function,
            detail: '@js(...)',
            documentation: 'Component-scoped JavaScript, rendered inline without a <script> wrapper.',
            textEdit: snippet('@js(\n\t$0\n)'),
            insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
        }, {
            label: '@{}',
            kind: vscode_languageserver_1.CompletionItemKind.Function,
            detail: '@{ expression }',
            documentation: 'Echo interpolation for a PHP expression, equivalent to <?= ... ?>.',
            textEdit: snippet('@{ ${1:expression} }'),
            insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
        }, {
            label: '@csrf',
            kind: vscode_languageserver_1.CompletionItemKind.Function,
            detail: '@csrf',
            documentation: 'Renders CSRF hidden token field.',
            textEdit: snippet('@csrf')
        }, {
            label: '@styles',
            kind: vscode_languageserver_1.CompletionItemKind.Function,
            detail: '@styles',
            documentation: 'Renders component stylesheet bundle in layout head.',
            textEdit: snippet('@styles')
        }, {
            label: '@scripts',
            kind: vscode_languageserver_1.CompletionItemKind.Function,
            detail: '@scripts',
            documentation: 'Renders component script bundle before body close.',
            textEdit: snippet('@scripts')
        });
        return items;
    }
    getComponentTagCompletions(range) {
        const items = [];
        const components = this.projectIndex.getAllComponents();
        for (const comp of components) {
            // Build snippet including required props
            let snippet = `${comp.tag}`;
            let propIndex = 1;
            for (const prop of comp.props.values()) {
                if (prop.isRequired) {
                    const name = (0, cast_language_core_1.spell)(prop.name, this.settings.propCase);
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
                kind: vscode_languageserver_1.CompletionItemKind.Class,
                detail: `<${comp.tag} />${frameworkTag}`,
                documentation: comp.description || `Component from ${comp.relativePath}`,
                textEdit: vscode_languageserver_1.TextEdit.replace(range, snippet),
                insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
            });
        }
        // Slot tag
        items.push({
            label: 'Slot',
            kind: vscode_languageserver_1.CompletionItemKind.Class,
            detail: '<Slot name="..." />',
            documentation: 'Inject content into a named component prop.',
            textEdit: vscode_languageserver_1.TextEdit.replace(range, 'Slot name="${1:name}">\n\t$0\n</Slot>'),
            insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
        });
        return items;
    }
    getAttributeCompletions(tag, used, range) {
        const meta = this.projectIndex.getComponent(tag);
        if (!meta)
            return [];
        const items = [];
        for (const prop of meta.props.values()) {
            if (used.has((0, cast_language_core_1.camel)(prop.name)))
                continue;
            const name = (0, cast_language_core_1.spell)(prop.name, this.settings.propCase);
            const kind = prop.kind ?? 'other';
            const values = prop.values ?? [];
            const placeholder = values.length ? `\${1|${values.join(',')}|}` : '$1';
            const snippet = kind === 'bool' ? name : kind === 'string' ? `${name}="${placeholder}"` : `${name}={$1}`;
            const item = {
                label: name,
                kind: vscode_languageserver_1.CompletionItemKind.Property,
                detail: [prop.type, prop.isRequired ? 'required' : prop.defaultValue !== undefined ? `default ${prop.defaultValue}` : 'optional'].filter(Boolean).join(' · '),
                documentation: prop.description,
                textEdit: vscode_languageserver_1.TextEdit.replace(range, snippet),
                insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
            };
            if (kind !== 'bool')
                item.command = { command: 'editor.action.triggerSuggest', title: 'values' };
            items.push(item);
        }
        return items;
    }
    getValueCompletions(tag, attributeName, quoted, range) {
        const meta = this.projectIndex.getComponent(tag);
        if (!meta)
            return [];
        const prop = this.findProp(meta.props, attributeName);
        if (!prop)
            return [];
        const kind = prop.kind ?? 'other';
        const values = kind === 'bool' ? ['true', 'false'] : prop.values ?? [];
        return values.map((value) => ({
            label: value,
            kind: vscode_languageserver_1.CompletionItemKind.EnumMember,
            detail: prop.name,
            textEdit: vscode_languageserver_1.TextEdit.replace(range, kind === 'bool' ? (quoted ? value : `{${value}}`) : quoted ? value : `"${value}"`)
        }));
    }
    /** The documented prop for an attribute name, matching the engine's camelCasing (`has-label` is `hasLabel`). */
    findProp(props, attributeName) {
        const wanted = (0, cast_language_core_1.camel)(attributeName);
        for (const prop of props.values()) {
            if (prop.name === attributeName || (0, cast_language_core_1.camel)(prop.name) === wanted)
                return prop;
        }
        return null;
    }
    getExtendsCompletions() {
        const items = [];
        for (const comp of this.projectIndex.getAllComponents()) {
            items.push({
                label: comp.tag,
                kind: vscode_languageserver_1.CompletionItemKind.Class,
                detail: comp.relativePath,
                documentation: `Inherit @props from ${comp.tag}`
            });
        }
        return items;
    }
}
exports.CompletionProvider = CompletionProvider;
//# sourceMappingURL=completion.js.map