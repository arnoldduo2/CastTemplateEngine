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
/** Prop names a component file reads: `$title ??= ...`, `@var ... $title`, `@param ... $title` (best effort, for the hover). */
export declare function propsOf(source: string): string[];
//# sourceMappingURL=resolve.d.ts.map