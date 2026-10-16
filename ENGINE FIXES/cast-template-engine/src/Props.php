<?php

declare(strict_types=1);

namespace CastTemplateEngine;

use CastTemplateEngine\Support\ComponentDocs;

/**
 * The PHP side of `@props{ ... }`: a strict-typed replacement for `$var ??= default;` + `@var` docblocks.
 *
 *   @props{
 *     string $tag = 'button';
 *     ?string $icon = null;
 *     bool $disabled = false;
 *     string $label; // no default - required
 *   }
 *
 * A component may instead inherit another's own declared props and override/add a few:
 *
 *   @props extends::Btns.Btn{
 *     string $margin = 'mx-1';
 *   }
 *
 * scan() itself only recognizes the `extends::Dotted.Path` text and reports it back (via the `extends` key) - it
 * has no access to the components directory or file resolution rules, so it cannot read the base file's own props
 * itself. Resolving `extends` to a file and merging the base's props with this block's own is Compiler's job
 * (Compiler::declaredPropsOf()/mergeExtendedProps()), the same way Compiler, not Props, already owns tag-to-file
 * resolution for a `<Component />` call.
 *
 * scan() is a compile-time textual pre-scan (same style as Css::scanClassRenames()): Compiler::compile() calls it
 * before Directives::compile() ever sees the source - @props{} isn't a recognized directive, so left unhandled it
 * would silently leak through as a literal "@" followed by raw "props{...}" text (Directives::at() has no case for
 * `@word{`). Compiler strips the block and emits a prelude of check() calls at the top of the compiled output.
 * Compiler::componentTag() also calls scan() against a *target* component's own file (a light text read, not a
 * recursive compile) so a definitely-missing required prop fails loudly at the calling template's own compile
 * time, not silently at render time.
 */
final class Props
{
    private const TYPES = ['string', 'int', 'float', 'bool', 'array', 'object', 'iterable', 'callable', 'mixed'];

    /** Matches `@props{` or `@props extends::Dotted.Path{`; group 1 is the dotted path, when present. */
    private const BLOCK_START = '/@props\b(?:\s+extends::([A-Za-z_][\w.]*))?\s*\{/';

    /**
     * @return array{props: list<array{name: string, types: list<string>, nullable: bool, required: bool, default: ?string, line: int}>, extends: ?string, start: ?int, end: ?int}
     */
    public static function scan(string $source, string $file = 'template'): array
    {
        $none = ['props' => [], 'extends' => null, 'start' => null, 'end' => null];

        if (!preg_match(self::BLOCK_START, $source, $m, PREG_OFFSET_CAPTURE)) return $none;
        $at = $m[0][1];
        $extends = isset($m[1]) && $m[1][1] !== -1 ? $m[1][0] : null;
        $openBrace = $at + strlen($m[0][0]) - 1;

        $markup = self::firstMarkupOffset($source);
        if ($markup !== null && $markup < $at) {
            $line = substr_count($source, "\n", 0, $markup) + 1;
            throw new TemplateError('@props{} must be declared before any HTML markup' . " in $file on line $line", $file, $line);
        }

        $close = Css::closing($source, $openBrace, '{', '}');
        if ($close === null) {
            $line = substr_count($source, "\n", 0, $at) + 1;
            throw new TemplateError("@props{ is never closed in $file on line $line", $file, $line);
        }

        $bodyStart = $openBrace + 1;
        $body = substr($source, $bodyStart, $close - $bodyStart);
        $props = self::parseEntries($body, $bodyStart, $source, $file);

        $end = $close + 1;
        if (preg_match('/\G\s*;/', $source, $sm, 0, $end)) $end += strlen($sm[0]);

        if (preg_match(self::BLOCK_START, $source, $_, 0, $end)) {
            $line = substr_count($source, "\n", 0, $at) + 1;
            throw new TemplateError("a second @props{} block is not allowed in $file on line $line", $file, $line);
        }

        return ['props' => $props, 'extends' => $extends, 'start' => $at, 'end' => $end];
    }

    /**
     * Validates one prop's actual value (or, when it was not passed, its already-evaluated default - see
     * Compiler::emitPropsPrelude()) against its declared type(s), and that a required prop was actually given.
     * Thrown errors point at the component's own @props{} line, not wherever it happened to be rendered from.
     * @param list<string> $types
     */
    public static function check(string $name, mixed $value, bool $wasProvided, bool $required, array $types, bool $nullable, string $file, int $line): mixed
    {
        if (!$wasProvided && $required) {
            throw new TemplateError("Missing required prop \"\$$name\" in $file on line $line", $file, $line);
        }
        if ($value === null) {
            if ($nullable) return null;
            throw new TemplateError("Prop \"\$$name\" cannot be null in $file on line $line", $file, $line);
        }
        foreach ($types as $type) {
            if (self::matches($type, $value)) return $value;
        }
        $expected = implode('|', $types) . ($nullable ? '|null' : '');
        $given = get_debug_type($value);
        throw new TemplateError("Prop \"\$$name\" expects $expected, got $given in $file on line $line", $file, $line);
    }

    private static function matches(string $type, mixed $value): bool
    {
        return match ($type) {
            'string' => is_string($value),
            'int' => is_int($value),
            'float' => is_float($value) || is_int($value), // PHP's own lossless int->float widening under strict_types, not a coercion
            'bool' => is_bool($value),
            'array' => is_array($value),
            'object' => is_object($value),
            'iterable' => is_iterable($value),
            'callable' => is_callable($value),
            'mixed' => true,
            default => false,
        };
    }

    /**
     * The offset of the first real HTML/component tag in $source: skips `<?php ?>`/`<?= ?>` blocks (same
     * recognition `Compiler::copyRaw('<?', '?>')` uses) and quoted strings, since a `<` inside either is never
     * markup. A directive (`@foreach`, `@if`, ...) is not markup either, and never starts with `<`, so it never
     * needs special handling here. A light text scan, not a full tokenizer - same documented-limitation style as
     * Css::scanClassRenames().
     */
    private static function firstMarkupOffset(string $source): ?int
    {
        $len = strlen($source);
        for ($i = 0; $i < $len; $i++) {
            $c = $source[$i];
            if ($c === '"' || $c === "'") {
                for ($i++; $i < $len && $source[$i] !== $c; $i++) if ($source[$i] === '\\') $i++;
                continue;
            }
            if ($c === '<' && ($source[$i + 1] ?? '') === '?') {
                $end = strpos($source, '?>', $i + 2);
                $i = $end === false ? $len : $end + 1;
                continue;
            }
            if ($c === '<' && preg_match('/\G<[A-Za-z!\/]/', $source, $_, 0, $i)) {
                return $i;
            }
        }
        return null;
    }

    /**
     * @return list<array{name: string, types: list<string>, nullable: bool, required: bool, default: ?string, line: int}>
     */
    private static function parseEntries(string $body, int $bodyOffset, string $source, string $file): array
    {
        $props = [];
        $seen = [];
        foreach (self::splitEntries($body) as ['text' => $text, 'offset' => $offset]) {
            $line = substr_count($source, "\n", 0, $bodyOffset + $offset) + 1;
            $text = trim($text);
            if ($text === '') continue;

            $read = ComponentDocs::readType($text);
            if ($read['type'] === null) {
                throw new TemplateError("a prop in @props{} needs a type (e.g. string \$name) in $file on line $line", $file, $line);
            }
            $rest = trim((string) $read['rest']);

            if (!preg_match('/^\$([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/s', $rest, $nm)) {
                throw new TemplateError("expected \$name after the type in @props{} in $file on line $line", $file, $line);
            }
            $name = $nm[1];
            if (isset($seen[$name])) {
                throw new TemplateError("\$$name is declared more than once in @props{} in $file on line $line", $file, $line);
            }
            $seen[$name] = true;

            $after = trim($nm[2] ?? '');
            $default = null;
            if ($after !== '') {
                if ($after[0] !== '=') {
                    throw new TemplateError("unexpected text after \$$name in @props{} in $file on line $line", $file, $line);
                }
                $default = trim(substr($after, 1));
                if ($default === '') {
                    throw new TemplateError("\$$name = is missing its default value in @props{} in $file on line $line", $file, $line);
                }
            }

            $parts = ComponentDocs::splitUnion($read['type']);
            $nullable = false;
            $types = [];
            foreach ($parts as $part) {
                if (strcasecmp($part, 'null') === 0) {
                    $nullable = true;
                    continue;
                }
                if (!in_array($part, self::TYPES, true)) {
                    throw new TemplateError("unsupported type \"$part\" in @props{} (use one of " . implode(', ', self::TYPES) . ') in ' . "$file on line $line", $file, $line);
                }
                $types[] = $part;
            }
            if ($types === []) {
                throw new TemplateError("a prop in @props{} needs a real type, not just ?/null, in $file on line $line", $file, $line);
            }

            $props[] = [
                'name' => $name,
                'types' => $types,
                'nullable' => $nullable,
                'required' => $default === null,
                'default' => $default,
                'line' => $line,
            ];
        }
        return $props;
    }

    /**
     * Splits the interior of @props{} into top-level, semicolon-terminated entries (PHP-statement style, not a
     * comma-separated list): comment-aware (a `//`/`/ *...* /` is stripped, not mistaken for content - this is
     * what lets a trailing `// solid, outline, soft, theme` note exist without its own commas being mistaken for
     * anything), quote-aware, and bracket-depth-aware (a `;` inside a default's own closure body is not a
     * separator). Comment text is replaced with matching newlines rather than removed outright, so line numbers
     * computed from the result stay accurate.
     * @return list<array{text: string, offset: int}>
     */
    private static function splitEntries(string $body): array
    {
        $entries = [];
        $n = strlen($body);
        $depth = 0;
        $quote = null;
        $clean = '';
        $entryStart = null;

        for ($i = 0; $i < $n; $i++) {
            $c = $body[$i];
            if ($quote !== null) {
                $clean .= $c;
                if ($c === '\\' && $i + 1 < $n) {
                    $i++;
                    $clean .= $body[$i];
                } elseif ($c === $quote) {
                    $quote = null;
                }
                continue;
            }
            if ($c === '"' || $c === "'") {
                if ($entryStart === null) $entryStart = $i;
                $quote = $c;
                $clean .= $c;
                continue;
            }
            if ($c === '/' && ($body[$i + 1] ?? '') === '/') {
                $end = strpos($body, "\n", $i);
                $i = $end === false ? $n : $end;
                if ($end !== false) $clean .= "\n";
                continue;
            }
            if ($c === '/' && ($body[$i + 1] ?? '') === '*') {
                $end = strpos($body, '*/', $i + 2);
                $segment = $end === false ? substr($body, $i) : substr($body, $i, $end + 2 - $i);
                $clean .= str_repeat("\n", substr_count($segment, "\n"));
                $i = $end === false ? $n - 1 : $end + 1;
                continue;
            }
            if (strpos('([{', $c) !== false) {
                $depth++;
            } elseif (strpos(')]}', $c) !== false) {
                $depth--;
            }
            if ($c === ';' && $depth <= 0) {
                if (trim($clean) !== '') $entries[] = ['text' => $clean, 'offset' => $entryStart ?? $i];
                $clean = '';
                $entryStart = null;
                continue;
            }
            if ($entryStart === null && !ctype_space($c)) $entryStart = $i;
            $clean .= $c;
        }
        if (trim($clean) !== '') $entries[] = ['text' => $clean, 'offset' => $entryStart ?? $n];

        return $entries;
    }
}
