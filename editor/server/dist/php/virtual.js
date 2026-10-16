"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VirtualPhpBuilder = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
const sourceMap_js_1 = require("./sourceMap.js");
class VirtualPhpBuilder {
    build(doc) {
        const sourceMap = new sourceMap_js_1.SourceMap();
        const lines = [];
        // Header
        lines.push('<?php');
        lines.push('declare(strict_types=1);');
        lines.push('');
        // Emit declared @props as typed variables
        if (doc.propsBlock) {
            for (const entry of doc.propsBlock.entries) {
                const vLine = lines.length;
                const lineStr = `/** @var ${entry.type} $${entry.name} */ $${entry.name} = null;`;
                lines.push(lineStr);
                sourceMap.addMapping(entry.nameRange, vscode_languageserver_1.Range.create(vLine, lineStr.indexOf(`$${entry.name}`), vLine, lineStr.indexOf(`$${entry.name}`) + entry.name.length + 1));
            }
            lines.push('');
        }
        // Emit echo holes
        for (const hole of doc.echoHoles) {
            const vLine = lines.length;
            const statement = `$_cast_val = (${hole.expression});`;
            lines.push(statement);
            const exprStart = statement.indexOf('(') + 1;
            sourceMap.addMapping(hole.expressionRange, vscode_languageserver_1.Range.create(vLine, exprStart, vLine, exprStart + hole.expression.length));
        }
        // Emit native PHP tags
        for (const tag of doc.phpTags) {
            const vLine = lines.length;
            const code = tag.code.trim();
            lines.push(code);
            sourceMap.addMapping(tag.range, vscode_languageserver_1.Range.create(vLine, 0, vLine, code.length));
        }
        return {
            code: lines.join('\n'),
            sourceMap
        };
    }
}
exports.VirtualPhpBuilder = VirtualPhpBuilder;
//# sourceMappingURL=virtual.js.map