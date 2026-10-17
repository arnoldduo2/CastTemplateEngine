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
exports.realFs = void 0;
exports.variants = variants;
exports.resolveComponent = resolveComponent;
exports.resolveLegacyComponent = resolveLegacyComponent;
exports.resolveView = resolveView;
exports.resolveModule = resolveModule;
exports.propsOf = propsOf;
/**
 * Maps names used in views to files, with exactly the engine's rules (CastTemplateEngine\Compiler::resolve):
 *   <KpiCard>         => kpi-card, kpi_card, KpiCard, kpiCard  (+ the extension), first existing file wins
 *   <Form.TextInput>  => form/text-input ..., every segment tried in those four styles, dots are folders
 * Pure functions aside from the injectable `fs`, so both the LSP's and the extension's Node process can use them
 * unchanged, once each supplies the resolved componentDirs/viewsDir/resourcesDir (see CastSettings).
 */
const nodeFs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
exports.realFs = {
    isFile: (p) => {
        try {
            return nodeFs.statSync(p).isFile();
        }
        catch {
            return false;
        }
    },
    isDir: (p) => {
        try {
            return nodeFs.statSync(p).isDirectory();
        }
        catch {
            return false;
        }
    },
};
/** The four spellings of one name segment, in the engine's order. */
function variants(name) {
    const words = name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ').toLowerCase();
    const unique = [words.replace(/ /g, '-'), words.replace(/ /g, '_'), name, name.charAt(0).toLowerCase() + name.slice(1)];
    return [...new Set(unique)];
}
function resolveComponent(tag, componentDirs, ext = '.cast.php', fs = exports.realFs) {
    const tried = [];
    for (const root of componentDirs) {
        const segments = tag.split('.');
        let dir = root;
        for (let i = 0; i < segments.length; i++) {
            const last = i === segments.length - 1;
            let found = null;
            for (const variant of variants(segments[i])) {
                const candidate = path.join(dir, variant + (last ? ext : ''));
                tried.push(candidate);
                if (last ? fs.isFile(candidate) : fs.isDir(candidate)) {
                    found = last ? candidate : variant;
                    break;
                }
            }
            if (found === null)
                break; // not in this folder: try the next one
            if (last)
                return { file: found, tried };
            dir = path.join(dir, found);
        }
    }
    return { file: null, tried };
}
/** `Component('btns.add-new')`: dots are folders, the name is used as written, `.cast.php` first and then the plain `.php`. */
function resolveLegacyComponent(name, componentDirs, ext = '.cast.php', fs = exports.realFs) {
    return firstFile(componentDirs.flatMap((dir) => [ext, '.php'].map((e) => path.join(dir, ...name.split(/[./]/)) + e)), fs);
}
/** `__includes('layouts.header')`, `views('home.home')`: dots (or slashes) are folders under the views folder. */
function resolveView(name, viewsDir, ext = '.cast.php', fs = exports.realFs) {
    const base = path.join(viewsDir, ...name.split(/[./]/));
    return firstFile([base + ext, base + '.php'], fs);
}
/** `__modules('items.items', 'js')` => resources/js/items/items.module.js ; css => resources/css/items/items.css */
function resolveModule(name, type, resourcesDir, fs = exports.realFs) {
    const base = path.join(resourcesDir, type === 'css' ? 'css' : 'js', ...name.split(/[./]/));
    return firstFile([type === 'css' ? base + '.css' : base + '.module.js'], fs);
}
function firstFile(candidates, fs) {
    const file = candidates.find((c) => fs.isFile(c)) || null;
    return { file, tried: candidates };
}
/** Prop names a component file reads: `$title ??= ...`, `@var ... $title`, `@param ... $title` (best effort, for the hover). */
function propsOf(source) {
    const names = new Set();
    const skip = new Set(['this', 'data', 'children', 'slots', 'GLOBALS']);
    for (const re of [/\$([A-Za-z_][A-Za-z0-9_]*)\s*\?\?=/g, /@(?:var|param|prop)\s+[^$\n]*\$([A-Za-z_][A-Za-z0-9_]*)/g]) {
        let m;
        while ((m = re.exec(source)))
            if (!skip.has(m[1]))
                names.add(m[1]);
    }
    return [...names];
}
//# sourceMappingURL=resolve.js.map