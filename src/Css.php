<?php

declare(strict_types=1);

namespace CastTemplateEngine;

/**
 * The CSS side of `@css( ... )`.
 *
 *   @css(
 *       li.active { border-color: @{ props['role'] === 'admin' ? '#fff' : '#666' }; }
 *   )
 *
 * Every `@{ expr }` hole becomes a CSS variable (`var(--cast-<id>-<n>)`), so the stylesheet itself stays static (it can be
 * bundled and minified at deploy) and only a tiny `style="--cast-<id>-<n>: value"` is written on the component's root element.
 * Selectors are scoped under `.cast-<id>`, a class the engine adds to the component's root element(s).
 */
final class Css
{
    /**
     * @return array{id: string, css: string, holes: array<int, string>} `holes` are PHP expressions keyed by variable number
     */
    public static function compileBody(string $body, string $file = 'template', int $line = 1): array
    {
        $id = substr(md5($body), 0, 8);
        $holes = [];
        $out = '';
        $pos = 0;
        $n = 0;

        while (($at = strpos($body, '@{', $pos)) !== false) {
            $out .= substr($body, $pos, $at - $pos);
            $end = self::closing($body, $at + 1, '{', '}');
            if ($end === null) {
                $openLine = $line + substr_count($body, "\n", 0, $at);
                throw new TemplateError("a { is never closed in @css( ) in $file on line $openLine", $file, $openLine);
            }
            $expr = trim(substr($body, $at + 2, $end - $at - 2));
            $holeLine = $line + substr_count($body, "\n", 0, $at);
            if ($expr === '') {
                throw new TemplateError("@{ } has nothing in it in $file on line $holeLine", $file, $holeLine);
            }
            // a hole is only allowed where a CSS variable can stand: a declaration value
            if (preg_match('/[;{}]/', $body, $m, PREG_OFFSET_CAPTURE, $end + 1) && $m[0][0] === '{') {
                throw new TemplateError("@{ } in @css( ) must be a value (e.g. color: @{ ... };), not part of a selector or at-rule, in $file on line $holeLine", $file, $holeLine);
            }
            $holes[++$n] = self::normalize($expr);
            $out .= "var(--cast-$id-$n)";
            $pos = $end + 1;
        }
        $out .= substr($body, $pos);

        return ['id' => $id, 'css' => $out, 'holes' => $holes];
    }

    /** `props['role']` and `props.role` both read the component's `$props`. */
    public static function normalize(string $expr): string
    {
        $expr = (string) preg_replace('/(?<![\w$>\'"])props\.([A-Za-z_]\w*)/', '$props[\'$1\']', $expr);
        return (string) preg_replace('/(?<![\w$>\'"])props\[/', '$props[', $expr);
    }

    /**
     * Finds every `@css( ... )` block in a RAW template source (before Directives::compile() transforms it away)
     * and maps each simple class selector it declares (e.g. `.myBtn`) to a per-component unique name
     * (`"<id>-myBtn"`, the same id compileBody() computes for that exact body text). The compiler uses this to
     * rewrite matching tokens in `class="..."` attributes throughout the same file, and scope() (below) uses it
     * to rename those same selectors in the generated stylesheet - so a class-only rule like `.myBtn { ... }`
     * ends up as `.<id>-myBtn { ... }` in the `<style>` tag and `class="... <id>-myBtn"` on the element that used
     * it, unique and merged in place, the same idea CSS Modules / styled-components use for scoped class names.
     *
     * A simple text scan, not a full tokenizer: a literal "@css(" inside a PHP string or comment would be
     * mistaken for a real block. An accepted, documented limitation, consistent with the engine's other
     * text-based scanners.
     *
     * @return array<string, string> original class name => scoped class name
     */
    public static function scanClassRenames(string $source): array
    {
        $map = [];
        $pos = 0;
        $len = strlen($source);
        while (($at = strpos($source, '@css', $pos)) !== false) {
            $p = $at + 4;
            while ($p < $len && ($source[$p] === ' ' || $source[$p] === "\t")) $p++;
            if (($source[$p] ?? '') !== '(') {
                $pos = $at + 4;
                continue;
            }
            $close = self::closing($source, $p, '(', ')');
            if ($close === null) break;
            // trim() to match Directives::parenthesised(), which is what Css::compileBody() actually receives -
            // the id must be computed from the identical bytes or the rename map and the real compiled id diverge.
            $body = trim(substr($source, $p + 1, $close - $p - 1));
            $id = substr(md5($body), 0, 8);
            foreach (self::classNamesIn($body) as $name) {
                // "cast-" prefix is required, not cosmetic: a CSS identifier can't start with a digit, and an md5
                // hex id frequently does (~10/16 of the time) - an un-prefixed class like "941e348f-foo" is invalid
                // CSS and silently breaks the whole stylesheet's parsing in the browser, not just that one rule.
                $map[$name] = "cast-$id-$name";
            }
            $pos = $close + 1;
        }
        return $map;
    }

    /** @return list<string> every class name used in a selector (never inside a declaration value), including nested @media/etc. bodies */
    private static function classNamesIn(string $css): array
    {
        $names = [];
        $len = strlen($css);
        $pos = 0;
        while ($pos < $len) {
            $brace = strpos($css, '{', $pos);
            $semi = strpos($css, ';', $pos);
            if ($brace === false || ($semi !== false && $semi < $brace)) {
                $pos = ($semi === false ? $len : $semi) + 1;
                continue;
            }
            $prelude = trim(substr($css, $pos, $brace - $pos));
            $close = self::closing($css, $brace, '{', '}') ?? $len;
            $inside = substr($css, $brace + 1, $close - $brace - 1);
            $pos = $close + 1;

            if ($prelude !== '' && $prelude[0] === '@') {
                $name = preg_match('/^@([a-z-]+)/i', $prelude, $m) ? strtolower($m[1]) : '';
                if (in_array($name, ['media', 'supports', 'container', 'layer', 'document'], true)) {
                    array_push($names, ...self::classNamesIn($inside));
                }
                continue;
            }

            if (preg_match_all('/\.([A-Za-z_-][\w-]*)/', $prelude, $cm)) {
                array_push($names, ...$cm[1]);
            }
        }
        return array_values(array_unique($names));
    }

    /** Replaces every `.className` token found in $classRenames with its scoped name; leaves everything else as-is. */
    private static function renameClasses(string $selector, array $classRenames): string
    {
        if (!$classRenames) return $selector;
        return (string) preg_replace_callback(
            '/\.([A-Za-z_-][\w-]*)/',
            static fn(array $m): string => isset($classRenames[$m[1]]) ? '.' . $classRenames[$m[1]] : $m[0],
            $selector,
        );
    }

    /**
     * True when every compound selector in $selector (split on combinators) is made up entirely of `.class`
     * and/or `:pseudo`/`::pseudo` parts - no bare element name, `*`, `#id` or attribute selector. Such a
     * selector, once its classes are renamed to their per-component unique form, needs no ancestor wrapper at
     * all: the hash already makes it unique. Anything else (e.g. `td`, `div.card`, `.list .item td`) keeps the
     * existing `$scope .selector` ancestor-wrap, since there's no class there (or not only classes) to rename.
     */
    private static function isPureClassSelector(string $selector): bool
    {
        $parts = preg_split('/\s*[>+~]\s*|\s+/', trim($selector));
        foreach ($parts as $part) {
            if ($part === '') continue;
            if (!preg_match('/^(?:\.[A-Za-z_-][\w-]*|::?[A-Za-z-]+(?:\([^)]*\))?)+$/', $part)) return false;
        }
        return true;
    }

    /** Prefixes every selector with $scope (e.g. `.cast-ab12cd34`), renaming any class token found in $classRenames. `&` and `:root` mean the root itself. @param array<string, string> $classRenames */
    public static function scope(string $css, string $scope, array $classRenames = []): string
    {
        $css = (string) preg_replace('~/\*.*?\*/~s', '', $css);
        return self::block($css, $scope, $classRenames);
    }

    /** @param array<string, string> $classRenames */
    private static function block(string $css, string $scope, array $classRenames = []): string
    {
        $out = '';
        $decls = [];
        $len = strlen($css);
        $pos = 0;

        while ($pos < $len) {
            $brace = strpos($css, '{', $pos);
            $semi = strpos($css, ';', $pos);

            if ($brace === false || ($semi !== false && $semi < $brace)) {
                $end = $semi === false ? $len : $semi;
                $stmt = trim(substr($css, $pos, $end - $pos));
                if ($stmt !== '') {
                    if ($stmt[0] === '@') $out .= $stmt . ';';          // @import ...
                    else $decls[] = $stmt;                              // a declaration for the root itself
                }
                $pos = $end + 1;
                continue;
            }

            $prelude = trim(substr($css, $pos, $brace - $pos));
            $close = self::closing($css, $brace, '{', '}') ?? $len;
            $inside = substr($css, $brace + 1, $close - $brace - 1);
            $pos = $close + 1;

            if ($prelude !== '' && $prelude[0] === '@') {
                $name = preg_match('/^@([a-z-]+)/i', $prelude, $m) ? strtolower($m[1]) : '';
                $nested = in_array($name, ['media', 'supports', 'container', 'layer', 'document'], true);
                $out .= $prelude . '{' . ($nested ? self::block($inside, $scope, $classRenames) : $inside) . '}';
                continue;
            }

            $selectors = [];
            foreach (self::splitSelectors($prelude) as $selector) {
                if ($selector === '') continue;
                if ($selector === ':root' || $selector === ':scope') {
                    $selectors[] = $scope;
                } elseif (str_contains($selector, '&')) {
                    $selectors[] = self::renameClasses(str_replace('&', $scope, $selector), $classRenames);
                } elseif ($classRenames && self::isPureClassSelector($selector)) {
                    // also keep the ancestor-wrapped original-name form: a dynamically built class value (e.g.
                    // concatenating a PHP variable into the class string) can't be renamed at compile time -
                    // there's no fixed token to match - so it still needs the root's cast-<id> ancestor class
                    // (see injectScope() below) to be styled; the flat renamed form alone would miss it.
                    $renamed = self::renameClasses($selector, $classRenames);
                    $selectors[] = $renamed !== $selector ? "$renamed, $scope $selector" : $renamed;
                } else {
                    $selectors[] = "$scope " . self::renameClasses($selector, $classRenames);
                }
            }
            if ($selectors) $out .= implode(',', $selectors) . '{' . $inside . '}';
        }

        return ($decls ? $scope . '{' . implode(';', $decls) . ';}' : '') . $out;
    }

    /** @return list<string> */
    private static function splitSelectors(string $prelude): array
    {
        $parts = [];
        $depth = 0;
        $current = '';
        foreach (str_split($prelude) as $c) {
            if ($c === '(' || $c === '[') $depth++;
            elseif ($c === ')' || $c === ']') $depth--;
            if ($c === ',' && $depth === 0) {
                $parts[] = trim($current);
                $current = '';
                continue;
            }
            $current .= $c;
        }
        $parts[] = trim($current);
        return $parts;
    }

    /**
     * Adds `cast-<id>` class(es) to a component's rendered root element - its first HTML tag - merging with
     * any existing `class="..."`/`class='...'` attribute, or adding one when there is none. This is what makes
     * `.cast-<id> .selector { ... }` (see scope() above) actually match something: nothing else in the engine
     * attaches that class anywhere, so without this step @css() scoping compiles correctly but never visually
     * applies. Called from CastTemplate::component() with the ids that component's own @css() calls registered
     * (via Assets::pushScope()/popScope()), on the fully rendered HTML string - not at compile time - so it
     * naturally follows whichever root actually rendered (e.g. one side of an `@if ($href): <a> @else: <button>`
     * choice), rather than only ever the first root tag written in the source.
     *
     * A no-op when the output doesn't start with a tag (leading whitespace is tolerated) - e.g. a component
     * that renders plain text or multiple top-level siblings keeps its ids unapplied rather than guessing.
     *
     * @param list<string> $ids
     */
    public static function injectScope(string $html, array $ids): string
    {
        if (!$ids) return $html;
        if (!preg_match('/^\s*<([a-zA-Z][\w-]*)/', $html, $m, PREG_OFFSET_CAPTURE)) return $html;
        $nameEnd = $m[0][1] + strlen($m[0][0]);

        $len = strlen($html);
        $pos = $nameEnd;
        $quote = null;
        while ($pos < $len) {
            $c = $html[$pos];
            if ($quote) {
                if ($c === $quote) $quote = null;
            } elseif ($c === '"' || $c === "'") {
                $quote = $c;
            } elseif ($c === '>') {
                break;
            }
            $pos++;
        }
        if ($pos >= $len) return $html; // unterminated tag: leave it alone

        $attrs = substr($html, $nameEnd, $pos - $nameEnd);
        $selfClose = '';
        if (preg_match('/\s*\/$/', $attrs, $sm)) {
            $selfClose = ' /';
            $attrs = substr($attrs, 0, -strlen($sm[0]));
        }
        $classes = implode(' ', array_map(static fn(string $id): string => "cast-$id", $ids));

        if (preg_match('/\sclass\s*=\s*"([^"]*)"/i', $attrs, $cm, PREG_OFFSET_CAPTURE)) {
            $attrs = substr_replace($attrs, "$classes {$cm[1][0]}", $cm[1][1], strlen($cm[1][0]));
        } elseif (preg_match("/\\sclass\\s*=\\s*'([^']*)'/i", $attrs, $cm, PREG_OFFSET_CAPTURE)) {
            $attrs = substr_replace($attrs, "$classes {$cm[1][0]}", $cm[1][1], strlen($cm[1][0]));
        } else {
            $attrs .= ' class="' . $classes . '"';
        }

        return substr($html, 0, $nameEnd) . $attrs . $selfClose . substr($html, $pos);
    }

    /** Position of the bracket that closes the one at $open, skipping quoted strings; null when never closed. */
    public static function closing(string $src, int $open, string $in, string $out): ?int
    {
        $depth = 0;
        $len = strlen($src);
        for ($i = $open; $i < $len; $i++) {
            $c = $src[$i];
            if ($c === '"' || $c === "'") {
                for ($i++; $i < $len && $src[$i] !== $c; $i++) if ($src[$i] === '\\') $i++;
                continue;
            }
            if ($c === $in) $depth++;
            elseif ($c === $out && --$depth === 0) return $i;
        }
        return null;
    }
}
