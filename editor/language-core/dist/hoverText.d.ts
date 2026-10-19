/**
 * Shared hover markdown for things that aren't Cast directives but still show up in a .cast.php file: built-in
 * JS runtime helpers, the `@{ }` echo hole, and fluent `.filter()/.map()` chain segments. Ported verbatim from
 * editor/vscode/extension.js so the LSP and the extension's own fallback engine never disagree about this text.
 */
export declare const BUILTIN_HOVERS: Record<string, string>;
export declare const ECHO_HOLE_HOVER = "**@{ ... }**\n\nAn echo hole: compiles the PHP expression inside and prints its value (like `<?= ... ?>`). Can itself contain `return(...)`/`@render(...)` to print a rendered chunk of markup.";
export declare const CHAIN_HOVER: {
    map: string;
    filter: string;
};
//# sourceMappingURL=hoverText.d.ts.map