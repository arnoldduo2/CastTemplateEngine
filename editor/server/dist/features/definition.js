"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefinitionProvider = void 0;
const fs = __importStar(require("fs"));
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
                if (!prop)
                    continue;
                if (prop.range) {
                    return vscode_languageserver_1.Location.create(vscode_uri_1.URI.file(meta.fsPath).toString(), prop.range);
                }
                // No @props{} entry tracked a range for this prop (it's declared via a docblock @var/@param tag or a
                // legacy `??=` default, which parseComponent's pure text analysis has no position tracking for) - fall
                // back to the same file-text regex scan extension.js's PropDefinitions already uses, so this is a
                // verified superset rather than losing the jump for most components (see Task 7's own comment on why
                // CastParser stays in use only for @props{} - this is the other half that comment didn't cover).
                const fallbackRange = this.declarationRange(meta, prop.name);
                if (fallbackRange) {
                    return vscode_languageserver_1.Location.create(vscode_uri_1.URI.file(meta.fsPath).toString(), fallbackRange);
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
    /** A prop's docblock @var/@param tag or legacy `??=` line in its own component file, converted to a Range. */
    declarationRange(meta, propName) {
        let source;
        try {
            source = fs.readFileSync(meta.fsPath, 'utf8');
        }
        catch {
            return null;
        }
        const offset = (0, cast_language_core_1.propDeclarationOffset)(source, propName);
        if (offset === null)
            return null;
        const position = this.positionAt(source, offset);
        return vscode_languageserver_1.Range.create(position, position);
    }
    positionAt(text, offset) {
        const prefix = text.slice(0, offset);
        const lines = prefix.split('\n');
        return { line: lines.length - 1, character: lines[lines.length - 1].length };
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