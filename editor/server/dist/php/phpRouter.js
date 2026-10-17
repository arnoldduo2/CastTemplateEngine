"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhpRouter = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
const cast_language_core_1 = require("cast-language-core");
function offsetAt(text, position) {
    let line = 0;
    let offset = 0;
    while (line < position.line && offset < text.length) {
        const newline = text.indexOf('\n', offset);
        offset = newline === -1 ? text.length : newline + 1;
        line += 1;
    }
    return Math.min(offset + position.character, text.length);
}
function positionAt(text, requested) {
    const offset = Math.max(0, Math.min(requested, text.length));
    const before = text.slice(0, offset);
    const line = (before.match(/\n/g) ?? []).length;
    const start = before.lastIndexOf('\n') + 1;
    return { line, character: offset - start };
}
class PhpRouter {
    client;
    constructor(client) {
        this.client = client;
    }
    async getDiagnostics(document) {
        const virtual = (0, cast_language_core_1.buildPhpVirtual)(document.uri, (0, cast_language_core_1.analyzeCast)(document.text));
        const upstream = await this.client.synchronize(virtual, document.version);
        const diagnostics = [];
        for (const diagnostic of upstream) {
            const virtualRange = {
                start: offsetAt(virtual.text, diagnostic.range.start),
                end: offsetAt(virtual.text, diagnostic.range.end),
                text: virtual.text.slice(offsetAt(virtual.text, diagnostic.range.start), offsetAt(virtual.text, diagnostic.range.end)),
            };
            const sourceRange = virtual.map.toSourceRange(virtualRange);
            if (!sourceRange)
                continue;
            diagnostics.push({
                range: vscode_languageserver_1.Range.create(positionAt(document.text, sourceRange.start), positionAt(document.text, sourceRange.end)),
                message: diagnostic.message,
                severity: (diagnostic.severity ?? vscode_languageserver_1.DiagnosticSeverity.Error),
                code: diagnostic.code === undefined ? undefined : String(diagnostic.code),
                source: 'cast-php',
            });
        }
        return diagnostics;
    }
}
exports.PhpRouter = PhpRouter;
//# sourceMappingURL=phpRouter.js.map