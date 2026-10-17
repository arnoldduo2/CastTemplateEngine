/**
 * Indentation for .cast.php views: HTML tags, component tags (<Card>, <Btns.Button />), PHP alternative syntax
 * (`<?php if (x): ?> ... <?php endif ?>`, braces, multi-line `<?php ... ?>` blocks) and the engine's @ directives
 * (@if ... @endif, @foreach, @forelse/@empty, @switch/@case, @php ... @endphp, @php(...), @props{ ... }).
 *
 * It only ever changes the leading whitespace of a line. Lines inside <script>, <style>, <pre>, <textarea>, HTML
 * comments and heredocs are left exactly as they are. Markup that is opened and closed in different `@if` branches
 * is tolerated: a closer that matches nothing is ignored and a closer pops everything opened after its opener.
 *
 * The sole source of truth for both the LSP formatter and the VS Code extension's auto-indent (see
 * editor/server/src/features/formatting.ts and editor/vscode/lib/indent.js, which re-exports the compiled output
 * of this module).
 */
export interface FormatOptions {
    tabSize?: number;
    insertSpaces?: boolean;
}
/** Depth of every line (null = leave it alone) and the depth after each line. */
export declare function computeIndents(lines: string[]): {
    depths: (number | null)[];
    after: number[];
};
export declare function indentString(depth: number, { tabSize, insertSpaces }?: FormatOptions): string;
/** The text with every line re-indented. */
export declare function formatCast(text: string, options?: FormatOptions): string;
/** The indentation a line should have, given the lines above it (and itself). null: leave it. */
export declare function indentFor(lines: string[], index: number, options?: FormatOptions): string | null;
//# sourceMappingURL=indent.d.ts.map