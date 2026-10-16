"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefinitionProvider = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
const vscode_uri_1 = require("vscode-uri");
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
        // 2. Definition on Component tag <Btns.Soft>
        for (const comp of doc.components) {
            if (this.positionInRange(position, comp.nameRange)) {
                const meta = this.projectIndex.getComponent(comp.name);
                if (meta) {
                    return vscode_languageserver_1.Location.create(vscode_uri_1.URI.file(meta.fsPath).toString(), vscode_languageserver_1.Range.create(0, 0, 0, 0));
                }
            }
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