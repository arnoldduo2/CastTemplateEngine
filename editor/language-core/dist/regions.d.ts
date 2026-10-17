import { CastAnalysis } from './types.js';
/**
 * Classifies native PHP, Cast PHP holes/arguments, and CSS/JS directive bodies.
 * It deliberately does not parse an entire .cast.php document as PHP: only the
 * returned PHP regions are candidates for PHP language tooling.
 */
export declare function analyzeCast(text: string): CastAnalysis;
/**
 * Finds real markup in the same conservative way as the engine's Props scanner.
 * PHP tags and quoted strings are skipped so documentation such as `<Card />`
 * inside a PHP docblock cannot make a later @props declaration invalid.
 */
export declare function firstMarkupOffset(text: string): number | null;
//# sourceMappingURL=regions.d.ts.map