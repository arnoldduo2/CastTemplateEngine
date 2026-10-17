"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionProvider = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
const syntaxSpec_js_1 = require("../syntaxSpec.js");
class CompletionProvider {
    projectIndex;
    syntax = (0, syntaxSpec_js_1.getCastSyntaxSpec)();
    constructor(projectIndex) {
        this.projectIndex = projectIndex;
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
    getComponentTagCompletions() {
        const items = [];
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
                kind: vscode_languageserver_1.CompletionItemKind.Class,
                detail: `<${comp.tag} />${frameworkTag}`,
                documentation: comp.description || `Component from ${comp.relativePath}`,
                insertText: snippet,
                insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
            });
        }
        // Slot tag
        items.push({
            label: 'Slot',
            kind: vscode_languageserver_1.CompletionItemKind.Class,
            detail: '<Slot name="..." />',
            documentation: 'Inject content into a named component prop.',
            insertText: 'Slot name="${1:name}">\n\t$0\n</Slot>',
            insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
        });
        return items;
    }
    getAttributeCompletions(tag) {
        const meta = this.projectIndex.getComponent(tag);
        if (!meta)
            return [];
        const items = [];
        for (const [name, prop] of meta.props.entries()) {
            const isString = prop.type.includes('string');
            const snippet = isString ? `${name}="\${1:${prop.defaultValue ?? ''}}"$0` : `${name}={\${1:${prop.defaultValue ?? ''}}}$0`;
            items.push({
                label: name,
                kind: vscode_languageserver_1.CompletionItemKind.Property,
                detail: `${prop.type}${prop.isRequired ? ' (required)' : ''}`,
                documentation: prop.description || (prop.defaultValue !== undefined ? `Default: ${prop.defaultValue}` : undefined),
                insertText: snippet,
                insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet
            });
        }
        return items;
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
    findComponentTagContext(doc, position) {
        for (const comp of doc.components) {
            if (!comp.isClosing &&
                comp.range.start.line <= position.line &&
                comp.range.end.line >= position.line) {
                return comp.name;
            }
        }
        return null;
    }
}
exports.CompletionProvider = CompletionProvider;
//# sourceMappingURL=completion.js.map