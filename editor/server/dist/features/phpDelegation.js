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
        if (!result || !this.isValidHover(result))
            return null;
        return { ...result, range: result.range ? this.toSourceRange(document, target, result.range) ?? undefined : undefined };
    }
    isValidHover(hover) {
        const contents = hover.contents;
        const text = typeof contents === 'string'
            ? contents
            : 'value' in contents
                ? contents.value
                : Array.isArray(contents)
                    ? contents.map(c => (typeof c === 'string' ? c : c.value)).join('\n')
                    : '';
        const trimmed = text.trim();
        if (!trimmed)
            return false;
        // Phpactor returns raw exception / issue messages as hover text when symbol reflection fails
        if (/^Could not find source with\b/i.test(trimmed))
            return false;
        if (/^Could not find container class\b/i.test(trimmed))
            return false;
        if (/^Class .* has no (method|property|constant)\b/i.test(trimmed))
            return false;
        if (/^Could not resolve reserved word\b/i.test(trimmed))
            return false;
        return true;
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
        if (!Array.isArray(result))
            return mapOne(result);
        const mapped = result.map(mapOne).filter((location) => location !== null);
        return mapped.length ? mapped : null;
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
    /**
     * Maps an edit's range, or drops the edit (returns null) when the range falls in generated-only virtual text
     * (buildPhpVirtual's own preamble/control-flow wrappers never map to a source range - see SourceMap.toSourceRange).
     * A dropped textEdit still leaves the completion item usable via its own insertText/label; a dropped
     * additionalTextEdit is simply omitted. Applying either at its untranslated virtual-document coordinates would
     * silently corrupt the real Cast file at an arbitrary offset.
     */
    mapEdit(document, target, edit) {
        const range = this.toSourceRange(document, target, edit.range);
        return range ? { ...edit, range } : null;
    }
    mapCompletion(document, target, item) {
        const mapped = item.textEdit && 'range' in item.textEdit ? this.mapEdit(document, target, item.textEdit) : item.textEdit;
        const textEdit = mapped ?? undefined;
        const additionalTextEdits = item.additionalTextEdits
            ?.map((edit) => this.mapEdit(document, target, edit))
            .filter((edit) => edit !== null);
        return { ...item, textEdit, additionalTextEdits };
    }
    /** Maps a definition result's range, or drops it (returns null) when mapping fails - never returns a Location
     * still pointing at the virtual `.cast-php` document, which has no real editor behind it. */
    mapLocation(document, target, location) {
        const uri = 'targetUri' in location ? location.targetUri : location.uri;
        if (uri !== target.virtual.uri)
            return location;
        if ('targetUri' in location) {
            const targetRange = this.toSourceRange(document, target, location.targetRange);
            const targetSelectionRange = this.toSourceRange(document, target, location.targetSelectionRange);
            return targetRange && targetSelectionRange
                ? { ...location, targetUri: document.uri, targetRange, targetSelectionRange }
                : null;
        }
        const range = this.toSourceRange(document, target, location.range);
        return range ? vscode_languageserver_1.Location.create(document.uri, range) : null;
    }
}
exports.PhpDelegation = PhpDelegation;
//# sourceMappingURL=phpDelegation.js.map