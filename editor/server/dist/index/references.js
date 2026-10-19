"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nonComponentReferences = nonComponentReferences;
const cast_language_core_1 = require("cast-language-core");
function positionAt(text, offset) {
    const lines = text.slice(0, offset).split('\n');
    return { line: lines.length - 1, character: lines[lines.length - 1].length };
}
function rangeAt(text, start, end) {
    return { start: positionAt(text, start), end: positionAt(text, end) };
}
/**
 * Legacy `Component('btns.add-new')`/`__includes('layouts.header')`/`__modules('app', 'css')` references, resolved
 * through the same settings-aware paths component tags already use. Shared by DefinitionProvider and
 * DocumentLinksProvider so the scan-and-resolve loop isn't duplicated in both.
 */
function nonComponentReferences(doc, projectIndex) {
    return (0, cast_language_core_1.scanHelpers)(doc.text).map((ref) => {
        const resolved = ref.kind === 'view' ? projectIndex.resolveView(ref.name)
            : ref.kind === 'legacy-component' ? projectIndex.resolveLegacyComponent(ref.name)
                : projectIndex.resolveModule(ref.name, ref.type === 'css' ? 'css' : 'js');
        return { kind: ref.kind, range: rangeAt(doc.text, ref.start, ref.end), file: resolved.file };
    });
}
//# sourceMappingURL=references.js.map