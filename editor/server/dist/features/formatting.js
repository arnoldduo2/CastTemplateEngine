"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormattingProvider = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
const cast_language_core_1 = require("cast-language-core");
class FormattingProvider {
    format(doc, options) {
        const lines = doc.text.split('\n');
        const newText = (0, cast_language_core_1.formatCast)(doc.text, { tabSize: options.tabSize, insertSpaces: options.insertSpaces });
        if (newText === doc.text) {
            return [];
        }
        const lastLine = Math.max(0, lines.length - 1);
        const lastCol = lines[lastLine]?.length ?? 0;
        return [
            vscode_languageserver_1.TextEdit.replace(vscode_languageserver_1.Range.create(0, 0, lastLine, lastCol), newText)
        ];
    }
}
exports.FormattingProvider = FormattingProvider;
//# sourceMappingURL=formatting.js.map