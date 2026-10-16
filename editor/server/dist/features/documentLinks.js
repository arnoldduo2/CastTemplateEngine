"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentLinksProvider = void 0;
const vscode_uri_1 = require("vscode-uri");
class DocumentLinksProvider {
    projectIndex;
    constructor(projectIndex) {
        this.projectIndex = projectIndex;
    }
    getDocumentLinks(doc) {
        const links = [];
        // Link extends:: target
        if (doc.propsBlock && doc.propsBlock.extendsTarget && doc.propsBlock.extendsRange) {
            const meta = this.projectIndex.getComponent(doc.propsBlock.extendsTarget);
            if (meta) {
                links.push({
                    range: doc.propsBlock.extendsRange,
                    target: vscode_uri_1.URI.file(meta.fsPath).toString(),
                    tooltip: `Go to ${meta.relativePath}`
                });
            }
        }
        // Link component tags
        for (const comp of doc.components) {
            if (comp.isClosing || comp.name === 'Slot')
                continue;
            const meta = this.projectIndex.getComponent(comp.name);
            if (meta) {
                links.push({
                    range: comp.nameRange,
                    target: vscode_uri_1.URI.file(meta.fsPath).toString(),
                    tooltip: `Open <${comp.name} /> from ${meta.relativePath}`
                });
            }
        }
        return links;
    }
}
exports.DocumentLinksProvider = DocumentLinksProvider;
//# sourceMappingURL=documentLinks.js.map