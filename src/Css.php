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
                throw new TemplateError("a { is never closed in @css( ) in $file on line " . ($line + substr_count($body, "\n", 0, $at)));
            }
            $expr = trim(substr($body, $at + 2, $end - $at - 2));
            $holeLine = $line + substr_count($body, "\n", 0, $at);
            if ($expr === '') {
                throw new TemplateError("@{ } has nothing in it in $file on line $holeLine");
            }
            // a hole is only allowed where a CSS variable can stand: a declaration value
            if (preg_match('/[;{}]/', $body, $m, PREG_OFFSET_CAPTURE, $end + 1) && $m[0][0] === '{') {
                throw new TemplateError("@{ } in @css( ) must be a value (e.g. color: @{ ... };), not part of a selector or at-rule, in $file on line $holeLine");
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

    /** Prefixes every selector with $scope (e.g. `.cast-ab12cd34`). `&` and `:root` mean the root itself. */
    public static function scope(string $css, string $scope): string
    {
        $css = (string) preg_replace('~/\*.*?\*/~s', '', $css);
        return self::block($css, $scope);
    }

    private static function block(string $css, string $scope): string
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
                $out .= $prelude . '{' . ($nested ? self::block($inside, $scope) : $inside) . '}';
                continue;
            }

            $selectors = [];
            foreach (self::splitSelectors($prelude) as $selector) {
                if ($selector === '') continue;
                if ($selector === ':root' || $selector === ':scope') $selectors[] = $scope;
                elseif (str_contains($selector, '&')) $selectors[] = str_replace('&', $scope, $selector);
                else $selectors[] = "$scope $selector";
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
