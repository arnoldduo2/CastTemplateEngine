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
exports.HoverProvider = void 0;
const fs = __importStar(require("fs"));
const vscode_languageserver_1 = require("vscode-languageserver");
const cast_language_core_1 = require("cast-language-core");
const syntaxSpec_js_1 = require("../syntaxSpec.js");
const references_js_1 = require("../index/references.js");
const KIND_TITLE = { component: 'Component', 'legacy-component': 'Component (legacy)', view: 'View', module: 'Module' };
const WORD_CHAR = /[@A-Za-z0-9_.]/;
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
/** The `/[@A-Za-z0-9_.]+/`-bounded word touching `offset`, matching VS Code's own getWordRangeAtPosition pattern
 * for BUILTIN_HOVERS lookups (so "Cast.on"/"handleEvent"/"@script" all resolve the same way as the extension). */
function wordAt(text, offset) {
    let start = offset;
    while (start > 0 && WORD_CHAR.test(text[start - 1]))
        start--;
    let end = offset;
    while (end < text.length && WORD_CHAR.test(text[end]))
        end++;
    return start < end ? text.slice(start, end) : null;
}
function markdownHover(value) {
    return { contents: { kind: vscode_languageserver_1.MarkupKind.Markdown, value } };
}
class HoverProvider {
    projectIndex;
    syntax = (0, syntaxSpec_js_1.getCastSyntaxSpec)();
    constructor(projectIndex) {
        this.projectIndex = projectIndex;
    }
    getHover(doc, position) {
        const offset = offsetAt(doc.text, position);
        // 0. BUILTIN_HOVERS / echo hole / fluent chain - not Cast directives, but still worth explaining, and shared
        // with the extension's own fallback engine so the two never disagree on the text.
        const word = wordAt(doc.text, offset);
        if (word && cast_language_core_1.BUILTIN_HOVERS[word]) {
            return markdownHover(cast_language_core_1.BUILTIN_HOVERS[word]);
        }
        if ((doc.text[offset] === '{' && doc.text[offset - 1] === '@') || (doc.text[offset] === '@' && doc.text[offset + 1] === '{')) {
            return markdownHover(cast_language_core_1.ECHO_HOLE_HOVER);
        }
        const chain = (0, cast_language_core_1.scanChainCalls)(doc.text).find((c) => offset >= c.start && offset <= c.end);
        if (chain) {
            return markdownHover(cast_language_core_1.CHAIN_HOVER[chain.method]);
        }
        // 1. Hover on Component tag
        for (const comp of doc.components) {
            if (this.positionInRange(position, comp.nameRange)) {
                const hover = this.getComponentHover(comp.name);
                if (hover)
                    return hover;
                // Not an indexed component (unknown, or not yet indexed) - still say what was looked for, same as the
                // extension's own generic references()-based hover, rather than silently showing nothing (a Ctrl+click-
                // then-see-nothing experience this plan's design calls out as a real parity gap, not a hypothetical one).
                if (comp.name === 'Slot')
                    continue;
                const { file, tried } = this.projectIndex.resolveComponentTag(comp.name);
                return this.referenceHover('component', comp.name, file, tried);
            }
            // Hover on Component attribute
            for (const attr of comp.attributes) {
                if (this.positionInRange(position, attr.nameRange)) {
                    return this.getAttributeHover(comp.name, attr.name);
                }
            }
        }
        // 2. Hover on Directive
        for (const d of doc.directives) {
            if (this.positionInRange(position, d.nameRange)) {
                return this.getDirectiveHover(d.name);
            }
        }
        // 3. Hover on @props entry
        if (doc.propsBlock) {
            for (const entry of doc.propsBlock.entries) {
                if (this.positionInRange(position, entry.nameRange) || this.positionInRange(position, entry.typeRange)) {
                    return {
                        contents: {
                            kind: vscode_languageserver_1.MarkupKind.Markdown,
                            value: `**Prop \`$${entry.name}\`**\n\n- **Type:** \`${entry.type}\`\n- **Nullable:** \`${entry.isNullable}\`\n- **Required:** \`${entry.isRequired}\`${entry.defaultValue !== undefined ? `\n- **Default:** \`${entry.defaultValue}\`` : ''}`
                        }
                    };
                }
            }
        }
        // 4. Hover on a legacy Component()/view()/module() reference - same resolution DefinitionProvider and
        // DocumentLinksProvider already share via references.ts, so all three features agree.
        for (const ref of (0, references_js_1.nonComponentReferences)(doc, this.projectIndex)) {
            if (this.positionInRange(position, ref.range)) {
                const label = doc.text.slice(offsetAt(doc.text, ref.range.start), offsetAt(doc.text, ref.range.end));
                return this.referenceHover(ref.kind, label, ref.file, ref.tried);
            }
        }
        return null;
    }
    /** The hover for a resolved/unresolved file reference (a component tag with no indexed metadata, or a legacy
     * Component()/view()/module() call) - ported from extension.js's Hovers (the "No file found. Looked for:"
     * text is the main way a user debugs a misnamed reference, so losing it once the LSP takes over would be a
     * real regression, not a cosmetic one). */
    referenceHover(kind, label, file, tried) {
        let md = `**${KIND_TITLE[kind] || 'Cast'}** \`${label}\`\n\n`;
        if (file) {
            md += `\`${file}\`\n\n`;
            if (kind === 'component' || kind === 'legacy-component') {
                try {
                    const props = (0, cast_language_core_1.propsOf)(fs.readFileSync(file, 'utf8'));
                    if (props.length)
                        md += `Props: ${props.map((p) => '`' + p + '`').join(', ')}\n\n`;
                }
                catch {
                    /* unreadable file: no props */
                }
            }
            md += 'Ctrl+click to open.';
        }
        else {
            md += 'No file found. Looked for:\n\n' + tried.slice(0, 8).map((t) => '- `' + t + '`').join('\n');
        }
        return markdownHover(md);
    }
    getComponentHover(tag) {
        const meta = this.projectIndex.getComponent(tag);
        if (!meta)
            return null;
        const fwBadge = meta.isFramework ? ' `(framework)`' : '';
        let md = `### <${meta.tag} />${fwBadge}\n\n`;
        if (meta.description) {
            md += `${meta.description}\n\n`;
        }
        md += `*Defined in [${meta.relativePath}]*\n\n`;
        if (meta.extends) {
            md += `*Extends:* \`${meta.extends}\`\n\n`;
        }
        if (meta.props.size > 0) {
            md += `#### Declared Props:\n`;
            md += `| Prop | Type | Default | Required |\n`;
            md += `|---|---|---|---|\n`;
            for (const [name, p] of meta.props.entries()) {
                const def = p.defaultValue !== undefined ? `\`${p.defaultValue}\`` : '—';
                const req = p.isRequired ? '✅ Yes' : 'No';
                md += `| \`${name}\` | \`${p.type}\` | ${def} | ${req} |\n`;
            }
            md += '\n';
        }
        if (meta.slots.length > 0) {
            md += `#### Slots:\n`;
            for (const slot of meta.slots) {
                md += `- \`<Slot name="${slot.name}">\`\n`;
            }
        }
        return {
            contents: {
                kind: vscode_languageserver_1.MarkupKind.Markdown,
                value: md
            }
        };
    }
    getAttributeHover(tag, attrName) {
        const meta = this.projectIndex.getComponent(tag);
        if (!meta)
            return null;
        const prop = meta.props.get(attrName);
        if (!prop)
            return null;
        let md = `**Prop \`${attrName}\`** on \`<${tag}>\`\n\n`;
        md += `- **Type:** \`${prop.type}\`\n`;
        md += `- **Required:** \`${prop.isRequired ? 'Yes' : 'No'}\`\n`;
        if (prop.defaultValue !== undefined) {
            md += `- **Default:** \`${prop.defaultValue}\`\n`;
        }
        if (prop.description) {
            md += `\n${prop.description}\n`;
        }
        return {
            contents: {
                kind: vscode_languageserver_1.MarkupKind.Markdown,
                value: md
            }
        };
    }
    getDirectiveHover(name) {
        // Check blocks
        for (const [key, block] of Object.entries(this.syntax.blocks)) {
            if (block.open === `@${name}` || block.close === `@${name}` || block.intermediates.includes(`@${name}`)) {
                let md = `**Cast Directive: \`@${name}\`**\n\n${block.description}\n\n`;
                md += `\`\`\`php\n${block.open} ... ${block.close}\n\`\`\``;
                return {
                    contents: {
                        kind: vscode_languageserver_1.MarkupKind.Markdown,
                        value: md
                    }
                };
            }
        }
        if (name === 'props') {
            return {
                contents: {
                    kind: vscode_languageserver_1.MarkupKind.Markdown,
                    value: `**Cast Directive: \`@props\`**\n\n${this.syntax.props.syntax}\n\nInheritance: \`${this.syntax.props.inheritanceSyntax}\`\n\nSupported types: ${this.syntax.props.supportedTypes.join(', ')}`
                }
            };
        }
        if (name === 'css') {
            return {
                contents: {
                    kind: vscode_languageserver_1.MarkupKind.Markdown,
                    value: `**Cast Directive: \`@css\`**\n\nComponent-scoped CSS with automatic class name hash isolation.\n\n\`\`\`css\n@css(\n  .container { display: flex; }\n)\n\`\`\``
                }
            };
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
exports.HoverProvider = HoverProvider;
//# sourceMappingURL=hover.js.map