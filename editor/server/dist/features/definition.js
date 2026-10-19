"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefinitionProvider = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
const vscode_uri_1 = require("vscode-uri");
const cast_language_core_1 = require("cast-language-core");
const references_js_1 = require("../index/references.js");
class DefinitionProvider {
    projectIndex;
    constructor(projectIndex) {
        this.projectIndex = projectIndex;
    }
    getDefinition(doc, position) {
        // 1. Definition for extends::Component.Path
        if (doc.propsBlock && doc.propsBlock.extendsTarget && doc.propsBlock.extendsRange) {
            if (this.positionInRange(position, doc.propsBlock.extendsRange)) {
                const meta = this.projectIndex.getComponent(doc.propsBlock.extendsTarget);
                if (meta) {
                    return vscode_languageserver_1.Location.create(vscode_uri_1.URI.file(meta.fsPath).toString(), vscode_languageserver_1.Range.create(0, 0, 0, 0));
                }
            }
        }
        // 2. Definition on Component tag <Btns.Soft>, or on one of its attributes (jump to the prop's own
        // declaration line in the component file, when CastParser tracked one - see ProjectIndex.indexFile).
        for (const comp of doc.components) {
            if (this.positionInRange(position, comp.nameRange)) {
                const meta = this.projectIndex.getComponent(comp.name);
                if (meta) {
                    return vscode_languageserver_1.Location.create(vscode_uri_1.URI.file(meta.fsPath).toString(), vscode_languageserver_1.Range.create(0, 0, 0, 0));
                }
            }
            for (const attr of comp.attributes) {
                if (!attr.name || !this.positionInRange(position, attr.nameRange))
                    continue;
                const meta = this.projectIndex.getComponent(comp.name);
                if (!meta)
                    continue;
                const prop = this.findProp(meta.props, attr.name);
                if (prop?.range) {
                    return vscode_languageserver_1.Location.create(vscode_uri_1.URI.file(meta.fsPath).toString(), prop.range);
                }
            }
        }
        // 3. Legacy Component()/view()/module() references
        for (const ref of (0, references_js_1.nonComponentReferences)(doc, this.projectIndex)) {
            if (ref.file && this.positionInRange(position, ref.range)) {
                return vscode_languageserver_1.Location.create(vscode_uri_1.URI.file(ref.file).toString(), vscode_languageserver_1.Range.create(0, 0, 0, 0));
            }
        }
        return null;
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
    positionInRange(pos, range) {
        if (!range)
            return false;
        if (pos.line < range.start.line || pos.line > range.end.line)
            return false;
        if (pos.line === range.start.line && pos.character < range.start.character)
            return false;
        if (pos.line === range.end.line && pos.character > range.end.character)
            return false;
        return true;
    }
}
exports.DefinitionProvider = DefinitionProvider;
//# sourceMappingURL=definition.js.map