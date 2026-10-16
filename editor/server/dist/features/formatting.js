"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormattingProvider = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
class FormattingProvider {
    format(doc, options) {
        const lines = doc.text.split('\n');
        const formatted = [];
        let indentLevel = 0;
        const indentStr = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
        const openDirectives = /^@(if|unless|isset|for|foreach|forelse|while|switch)\b/;
        const closeDirectives = /^@(endif|endunless|endisset|endfor|endforeach|endforelse|endwhile|endswitch)\b/;
        const intermediateDirectives = /^@(elseif|else|empty|case|default)\b/;
        // Component tags
        const openComponentTag = /^<(Slot|[A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)*)[^>]*[^/]>/;
        const closeComponentTag = /^<\/(Slot|[A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)*)>/;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed.length === 0) {
                formatted.push('');
                continue;
            }
            // Check if this line decreases indentation before rendering
            let currentIndent = indentLevel;
            if (closeDirectives.test(trimmed) ||
                closeComponentTag.test(trimmed) ||
                trimmed.startsWith('}')) {
                currentIndent = Math.max(0, indentLevel - 1);
                indentLevel = currentIndent;
            }
            else if (intermediateDirectives.test(trimmed)) {
                currentIndent = Math.max(0, indentLevel - 1);
            }
            formatted.push(indentStr.repeat(currentIndent) + trimmed);
            // Check if this line increases indentation for subsequent lines
            if (openDirectives.test(trimmed) ||
                (openComponentTag.test(trimmed) && !closeComponentTag.test(trimmed) && !trimmed.endsWith('/>')) ||
                trimmed.startsWith('@props') && trimmed.includes('{') ||
                trimmed === '{') {
                indentLevel++;
            }
        }
        const newText = formatted.join('\n');
        if (newText === doc.text) {
            return [];
        }
        return [
            vscode_languageserver_1.TextEdit.replace(vscode_languageserver_1.Range.create(0, 0, lines.length, 0), newText)
        ];
    }
}
exports.FormattingProvider = FormattingProvider;
//# sourceMappingURL=formatting.js.map