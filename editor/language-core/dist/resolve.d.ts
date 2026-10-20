export interface FsLike {
    isFile(path: string): boolean;
    isDir(path: string): boolean;
}
export declare const realFs: FsLike;
export interface ResolveResult {
    file: string | null;
    tried: string[];
}
/** The four spellings of one name segment, in the engine's order. */
export declare function variants(name: string): string[];
export declare function resolveComponent(tag: string, componentDirs: string[], ext?: string, fs?: FsLike): ResolveResult;
/** `Component('btns.add-new')`: dots are folders, the name is used as written, `.cast.php` first and then the plain `.php`. */
export declare function resolveLegacyComponent(name: string, componentDirs: string[], ext?: string, fs?: FsLike): ResolveResult;
/** `__includes('layouts.header')`, `views('home.home')`: dots (or slashes) are folders under the views folder. */
export declare function resolveView(name: string, viewsDir: string, ext?: string, fs?: FsLike): ResolveResult;
/** `__modules('items.items', 'js')` => resources/js/items/items.module.js ; css => resources/css/items/items.css */
export declare function resolveModule(name: string, type: 'css' | 'js', resourcesDir: string, fs?: FsLike): ResolveResult;
/** The offset of a prop's own declaration in a component file's text - a docblock `@var`/`@param`/`@prop`/
 * `@property` tag naming it, or its legacy `$name ??= default` line - whichever comes first. `null` when neither
 * is present (e.g. the prop only exists via `@props{}`, which the caller tracks a real range for separately -
 * see editor/server/src/index/projectIndex.ts's own comment on why CastParser stays in use for that one piece).
 * Ported from editor/vscode/extension.js's PropDefinitions (Ctrl+click on a prop name), so definition.ts can share
 * the exact same "where is this declared" lookup for docblock/`??=` props instead of only ever finding one for a
 * `@props{}` entry's own tracked range. */
export declare function propDeclarationOffset(source: string, name: string): number | null;
/** Prop names a component file reads: `$title ??= ...`, `@var ... $title`, `@param ... $title` (best effort, for the hover). */
export declare function propsOf(source: string): string[];
//# sourceMappingURL=resolve.d.ts.map