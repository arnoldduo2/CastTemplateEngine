<?php

declare(strict_types=1);

namespace CastTemplateEngine;

/**
 * Collection helper for @map, @filter and chained collection rendering.
 * Supports arrays and stdClass objects.
 * Automatically injects data-el-key="..." onto the root element of each rendered item.
 */
final class Collection
{
    /**
     * Map over items (array or stdClass) and render HTML.
     *
     * @param mixed $items Array or stdClass object
     * @param callable $callback fn($item, $keyOrIndex): string
     */
    public static function map(mixed $items, callable $callback): string
    {
        $iterable = self::normalize($items);
        $output = '';
        $index = 0;

        foreach ($iterable as $key => $item) {
            $html = (string) $callback($item, $index, $key);
            $output .= self::ensureDataElKey($html, $index);
            $index++;
        }

        return $output;
    }

    /**
     * Filter items, optionally mapping the filtered results.
     *
     * @param mixed $items Array or stdClass object
     * @param callable $predicate fn($item, $keyOrIndex): bool
     * @param callable|null $mapCallback fn($item, $index, $key): string
     * @return string|array If $mapCallback is provided, returns rendered HTML; otherwise returns filtered array.
     */
    public static function filter(mixed $items, callable $predicate, ?callable $mapCallback = null): string|array
    {
        $iterable = self::normalize($items);
        $filtered = [];
        $index = 0;

        foreach ($iterable as $key => $item) {
            if ($predicate($item, $index, $key)) {
                $filtered[$key] = $item;
            }
            $index++;
        }

        if ($mapCallback !== null) {
            return self::map($filtered, $mapCallback);
        }

        return is_object($items) ? (object) $filtered : $filtered;
    }

    /**
     * Normalizes an array or stdClass object into an iterable array.
     */
    public static function normalize(mixed $items): array
    {
        if (is_array($items)) {
            return $items;
        }
        if ($items instanceof \stdClass) {
            return get_object_vars($items);
        }
        if ($items instanceof \Traversable) {
            return iterator_to_array($items);
        }
        if (is_null($items)) {
            return [];
        }
        return (array) $items;
    }

    /**
     * Ensures the root element in the rendered HTML has data-el-key="...".
     * If the root already has data-el-key or key attribute, normalizes it.
     * If missing, adds data-el-key="$fallbackKey".
     */
    public static function ensureDataElKey(string $html, int|string $fallbackKey): string
    {
        $trimmed = trim($html);
        if ($trimmed === '' || $trimmed[0] !== '<' || str_starts_with($trimmed, '<!--')) {
            return $html;
        }

        // Look for existing key or data-el-key on the first opening tag
        if (preg_match('/^<([a-zA-Z0-9_\-.:]+)(\s[^>]*)?>/s', $trimmed, $m)) {
            $tag = $m[1];
            $attrs = $m[2] ?? '';

            // If tag already has data-el-key, leave as is
            if (preg_match('/\bdata-el-key\s*=/i', $attrs)) {
                return $html;
            }

            // If tag has key="...", convert or mirror it to data-el-key="..."
            if (preg_match('/\bkey\s*=\s*("([^"]*)"|\'([^\']*)\')/i', $attrs, $km)) {
                $keyValue = $km[2] !== '' ? $km[2] : ($km[3] ?? '');
                $newAttrs = preg_replace('/\bkey\s*=\s*(?:"[^"]*"|\'[^\']*\')/i', 'data-el-key="' . htmlspecialchars($keyValue, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '"', $attrs);
                $replacement = "<{$tag}{$newAttrs}>";
                return substr_replace($trimmed, $replacement, 0, strlen($m[0]));
            }

            // Otherwise, inject data-el-key="$fallbackKey"
            $escapedFallback = htmlspecialchars((string) $fallbackKey, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $replacement = "<{$tag} data-el-key=\"{$escapedFallback}\"{$attrs}>";
            return substr_replace($trimmed, $replacement, 0, strlen($m[0]));
        }

        return $html;
    }
}
