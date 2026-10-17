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
exports.ProjectIndex = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cast_language_core_1 = require("cast-language-core");
const settings_js_1 = require("../settings.js");
const castParser_js_1 = require("../parser/castParser.js");
/** parseComponent (cast-language-core) is pure text analysis with no position tracking, matching the PHP reader's
 * own JSON-only output - but a @props{} entry's declared range (for go-to-definition on a prop) only exists in
 * CastParser's real AST. CastParser stays in use for that one piece; every other field comes from parseComponent. */
function isNullableType(type) {
    if (!type)
        return false;
    if (type.startsWith('?'))
        return true;
    return (0, cast_language_core_1.splitUnion)(type).some((t) => /^null$/i.test(t));
}
class ProjectIndex {
    components = new Map(); // Tag => Metadata
    fileToTag = new Map(); // fsPath => Tag
    workspaceRoots = [];
    settings = settings_js_1.DEFAULT_SETTINGS;
    parser = new castParser_js_1.CastParser(); // @props{} entry ranges only - see isNullableType's comment above
    constructor(workspaceRoots = []) {
        this.workspaceRoots = workspaceRoots;
    }
    setWorkspaceRoots(roots) {
        this.workspaceRoots = roots;
    }
    /** Stores the resolved cast.* settings and re-indexes, so a changed componentsPath/extension takes effect. */
    setSettings(settings) {
        this.settings = settings;
        void this.indexAll();
    }
    componentDirs() {
        return this.workspaceRoots.flatMap((root) => this.settings.componentsPath.map((p) => path.join(root, p)));
    }
    /** `Component('btns.add-new')` - resolved against the same componentsPath settings as component tags. */
    resolveLegacyComponent(name) {
        return (0, cast_language_core_1.resolveLegacyComponent)(name, this.componentDirs(), this.settings.extension);
    }
    /** `__includes('layouts.header')`, `view('home.home')` - resolved under the first workspace root's viewsPath. */
    resolveView(name) {
        const root = this.workspaceRoots[0];
        if (!root)
            return { file: null, tried: [] };
        return (0, cast_language_core_1.resolveView)(name, path.join(root, this.settings.viewsPath), this.settings.extension);
    }
    /** `__modules('items.items', 'js')` - resolved under the first workspace root's resourcesPath. */
    resolveModule(name, type) {
        const root = this.workspaceRoots[0];
        if (!root)
            return { file: null, tried: [] };
        return (0, cast_language_core_1.resolveModule)(name, type, path.join(root, this.settings.resourcesPath));
    }
    async indexAll() {
        this.components.clear();
        this.fileToTag.clear();
        for (const root of this.workspaceRoots) {
            await this.scanDirectory(root);
        }
        // Resolve extends chains
        this.resolveAllExtends();
    }
    async scanDirectory(root) {
        if (!fs.existsSync(root))
            return;
        // Scan standard component folders
        const potentialDirs = [
            path.join(root, 'resources/views/components'),
            path.join(root, 'resources/views'),
            path.join(root, 'src/resources/views/components'),
            path.join(root, 'src/resources/views'),
            path.join(root, 'components'),
            // Framework-owned views
            path.join(root, 'starter/resources/views/components'),
            path.join(root, 'starter/resources/views'),
        ];
        for (const dir of potentialDirs) {
            if (fs.existsSync(dir)) {
                const isFramework = dir.includes('starter') || dir.includes('vendor');
                await this.scanRecursive(dir, dir, isFramework);
            }
        }
    }
    async scanRecursive(baseDir, currentDir, isFramework) {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'vendor') {
                    await this.scanRecursive(baseDir, fullPath, isFramework);
                }
            }
            else if (entry.isFile() && (entry.name.endsWith('.cast.php') || entry.name.endsWith('.php'))) {
                this.indexFile(baseDir, fullPath, isFramework);
            }
        }
    }
    indexFile(baseDir, fsPath, isFramework = false) {
        try {
            const content = fs.readFileSync(fsPath, 'utf-8');
            const stats = fs.statSync(fsPath);
            const relative = path.relative(baseDir, fsPath).replace(/\\/g, '/');
            // Tag name generation from relative path:
            // e.g. "btns/btn-soft.cast.php" -> "Btns.Soft" or "Btns.BtnSoft"
            const tag = this.pathToTag(relative);
            // The shared parser already merges docblocks, legacy ??= defaults, and @props{} with the engine's own
            // priority rule (verified byte-for-byte against the PHP reader's fixtures) - no second, independently-drifted
            // merge pass needed here. CastParser is still used, but only for a @props{} entry's own source range (for
            // go-to-definition), which parseComponent's pure text analysis has no equivalent of.
            const spec = (0, cast_language_core_1.parseComponent)(content);
            const doc = this.parser.parse(fsPath, content);
            const rangeByName = new Map();
            if (doc.propsBlock) {
                for (const entry of doc.propsBlock.entries)
                    rangeByName.set(entry.name, entry.range);
            }
            const props = new Map();
            for (const prop of spec.props) {
                props.set(prop.name, {
                    name: prop.name,
                    type: prop.type ?? '',
                    isNullable: isNullableType(prop.type),
                    isRequired: prop.required,
                    defaultValue: prop.default ?? undefined,
                    description: prop.description || undefined,
                    range: rangeByName.get(prop.name),
                    values: prop.values,
                    kind: prop.kind,
                    deprecated: prop.deprecated,
                    inferred: prop.inferred
                });
            }
            // Project view overrides framework view if duplicate tag
            const existing = this.components.get(tag);
            if (existing && !existing.isFramework && isFramework) {
                return existing; // Project view takes precedence
            }
            const meta = {
                tag,
                fsPath,
                relativePath: relative,
                isFramework,
                description: spec.description || undefined,
                extends: spec.extends,
                props,
                slots: spec.slots,
                deprecated: spec.deprecated,
                examples: spec.examples,
                mtime: stats.mtimeMs
            };
            this.components.set(tag, meta);
            this.fileToTag.set(fsPath, tag);
            return meta;
        }
        catch {
            return null;
        }
    }
    removeFile(fsPath) {
        const tag = this.fileToTag.get(fsPath);
        if (tag) {
            this.components.delete(tag);
            this.fileToTag.delete(fsPath);
        }
    }
    getComponent(tag) {
        // Exact match
        if (this.components.has(tag)) {
            return this.components.get(tag);
        }
        // Case-insensitive or normalized match
        const lower = tag.toLowerCase();
        for (const [k, meta] of this.components.entries()) {
            if (k.toLowerCase() === lower) {
                return meta;
            }
        }
        return undefined;
    }
    getAllComponents() {
        return Array.from(this.components.values());
    }
    getComponentByPath(fsPath) {
        const tag = this.fileToTag.get(fsPath);
        return tag ? this.components.get(tag) : undefined;
    }
    resolveAllExtends() {
        for (const meta of this.components.values()) {
            if (meta.extends) {
                this.resolveExtendsChain(meta, new Set());
            }
        }
    }
    resolveExtendsChain(child, visited) {
        if (!child.extends || visited.has(child.tag))
            return;
        visited.add(child.tag);
        const parent = this.getComponent(child.extends);
        if (!parent)
            return;
        // Recurse first if parent also extends
        if (parent.extends) {
            this.resolveExtendsChain(parent, visited);
        }
        // Merge parent props that aren't overridden
        for (const [name, prop] of parent.props.entries()) {
            if (!child.props.has(name)) {
                child.props.set(name, { ...prop });
            }
        }
    }
    pathToTag(relPath) {
        // Strip extensions: .cast.php or .php
        const clean = relPath.replace(/\.(cast\.php|php)$/, '');
        const parts = clean.split(/[\\/]/);
        const titleParts = parts.map(part => {
            // Convert kebab-case or snake_case to PascalCase
            return part
                .split(/[-_]/)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join('');
        });
        return titleParts.join('.');
    }
}
exports.ProjectIndex = ProjectIndex;
//# sourceMappingURL=projectIndex.js.map