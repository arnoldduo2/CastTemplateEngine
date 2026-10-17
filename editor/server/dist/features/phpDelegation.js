"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhpDelegation = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
const cast_language_core_1 = require("cast-language-core");
function offsetAt(text, position) {
    let lineStart = 0;
    for (let line = 0; line < position.line; line += 1) {
        const newline = text.indexOf('\n', lineStart);
        if (newline === -1)
            return text.length;
        lineStart = newline + 1;
    }
    return Math.min(lineStart + position.character, text.length);
}
function positionAt(text, offset) {
    const clamped = Math.max(0, Math.min(offset, text.length));
    const prefix = text.slice(0, clamped);
    return { line: (prefix.match(/\n/g) ?? []).length, character: clamped - prefix.lastIndexOf('\n') - 1 };
}
/** Routes only embedded-PHP positions to Phpactor, then translates result ranges home. */
class PhpDelegation {
    client;
    constructor(client) {
        this.client = client;
    }
    async hover(document, position) {
        const target = await this.targetAt(document, position);
        if (!target)
            return null;
        const result = await this.client.request('textDocument/hover', this.requestParams(target));
        return result ? { ...result, range: result.range ? this.toSourceRange(document, target, result.range) ?? undefined : undefined } : null;
    }
    async completion(document, position) {
        const target = await this.targetAt(document, position);
        if (!target)
            return null;
        const result = await this.client.request('textDocument/completion', this.requestParams(target));
        if (!result)
            return null;
        const items = Array.isArray(result) ? result : result.items;
        const mapped = items.map((item) => this.mapCompletion(document, target, item));
        return Array.isArray(result) ? mapped : { ...result, items: mapped };
    }
    async definition(document, position) {
        const target = await this.targetAt(document, position);
        if (!target)
            return null;
        const result = await this.client.request('textDocument/definition', this.requestParams(target));
        if (!result)
            return null;
        const mapOne = (location) => this.mapLocation(document, target, location);
        return Array.isArray(result) ? result.map(mapOne) : mapOne(result);
    }
    async signatureHelp(document, position) {
        const target = await this.targetAt(document, position);
        return target ? this.client.request('textDocument/signatureHelp', this.requestParams(target)) : null;
    }
    async targetAt(document, position) {
        const sourceOffset = offsetAt(document.text, position);
        const analysis = (0, cast_language_core_1.analyzeCast)(document.text);
        const region = analysis.regions.find((candidate) => candidate.kind === 'php' && sourceOffset >= candidate.range.start && sourceOffset <= candidate.range.end);
        if (!region)
            return null;
        const virtual = (0, cast_language_core_1.buildPhpVirtual)(document.uri, analysis);
        const virtualOffset = virtual.map.toVirtualOffset(sourceOffset);
        if (virtualOffset === null)
            return null;
        await this.client.synchronize(virtual, document.version);
        return { virtual, sourceOffset, virtualOffset };
    }
    requestParams(target) {
        return { textDocument: { uri: target.virtual.uri }, position: positionAt(target.virtual.text, target.virtualOffset) };
    }
    toSourceRange(document, target, range) {
        const virtualStart = offsetAt(target.virtual.text, range.start);
        const virtualEnd = offsetAt(target.virtual.text, range.end);
        const mapped = target.virtual.map.toSourceRange({ start: virtualStart, end: virtualEnd, text: target.virtual.text.slice(virtualStart, virtualEnd) });
        return mapped ? vscode_languageserver_1.Range.create(positionAt(document.text, mapped.start), positionAt(document.text, mapped.end)) : null;
    }
    mapCompletion(document, target, item) {
        const mapEdit = (edit) => ({ ...edit, range: this.toSourceRange(document, target, edit.range) ?? edit.range });
        const textEdit = item.textEdit
            ? 'range' in item.textEdit ? mapEdit(item.textEdit) : item.textEdit
            : undefined;
        return { ...item, textEdit, additionalTextEdits: item.additionalTextEdits?.map(mapEdit) };
    }
    mapLocation(document, target, location) {
        const uri = 'targetUri' in location ? location.targetUri : location.uri;
        if (uri !== target.virtual.uri)
            return location;
        if ('targetUri' in location) {
            const targetRange = this.toSourceRange(document, target, location.targetRange);
            const targetSelectionRange = this.toSourceRange(document, target, location.targetSelectionRange);
            return targetRange && targetSelectionRange
                ? { ...location, targetUri: document.uri, targetRange, targetSelectionRange }
                : location;
        }
        const range = this.toSourceRange(document, target, location.range);
        return range ? vscode_languageserver_1.Location.create(document.uri, range) : location;
    }
}
exports.PhpDelegation = PhpDelegation;
//# sourceMappingURL=phpDelegation.js.map