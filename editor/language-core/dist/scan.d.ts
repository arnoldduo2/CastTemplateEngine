/**
 * References in PHP helper calls (`view()`/legacy `Component()`/module helpers) and fluent `.filter()/.map()`
 * collection chains. Pure text scans, ported from editor/vscode/lib/scan.js so the LSP can share them; this module
 * does not port `scanComponents` - the LSP already has its own component-tag detection via `CastParser`, and the
 * extension's copy of `scanComponents` stays extension-only (no shared consumer needs it).
 */
export type HelperKind = 'view' | 'legacy-component' | 'module';
export interface HelperRef {
    kind: HelperKind;
    name: string;
    start: number;
    end: number;
    type?: 'css' | 'js';
}
/** References in PHP helper calls: the name inside the quotes. */
export declare function scanHelpers(src: string): HelperRef[];
export interface ChainRef {
    kind: 'chain';
    method: 'filter' | 'map';
    start: number;
    end: number;
}
/**
 * Finds `.filter`/`.map` segments of a fluent collection chain: `@$items.filter(...).map(...)` (the `$` is optional).
 * Only the method name is returned as a range (not the leading dot or the parentheses), same convention as
 * `scanComponents`' tag-name ranges. Skips `<?php ?>`, comments, `<script>` and `<style>`, same as component scanning,
 * since the chain is only ever recognized in the template's HTML/markup region (CastTemplateEngine\Directives::handleChain).
 */
export declare function scanChainCalls(src: string): ChainRef[];
//# sourceMappingURL=scan.d.ts.map