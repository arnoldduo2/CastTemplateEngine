<?php

declare(strict_types=1);

namespace CastTemplateEngine\Support;

/**
 * Reads what a component file says about itself: its docblocks and its `$prop ??= default` lines.
 * PHP port of editor/vscode/lib/docblock.js: this class and that file must produce exactly the same
 * JSON for the fixtures in tests/fixtures/components — that is the contract between the two.
 *
 * Spec: [
 *   'description' => string,
 *   'props' => [['name', 'type', 'description', 'required', 'default', 'values', 'kind', 'deprecated', 'inferred'], ...],
 *   'slots' => [['name', 'description'], ...],
 *   'examples' => string[],
 *   'deprecated' => false|string,
 * ]
 */
final class ComponentDocs
{
    private const PROP_TAGS = ['var', 'param', 'prop', 'property', 'property-read', 'property-write'];

    /**
     * @return array{description: string, props: array, slots: array, examples: array, deprecated: bool|string}
     */
    public static function parseComponent(string $source): array
    {
        $source = (string) preg_replace('/\r\n?/', "\n", $source);
        $blocks = self::docblocks($source);

        $spec = [
            'description' => '',
            'props' => [],
            'slots' => [],
            'examples' => [],
            'deprecated' => false,
        ];
        $byName = [];

        foreach ($blocks as $block) {
            if ($spec['description'] === '' && $block['summary'] !== '') {
                $spec['description'] = $block['summary'];
            }

            foreach ($block['tags'] as $tag) {
                if (in_array($tag['name'], self::PROP_TAGS, true)) {
                    $prop = self::propFromTag($tag, $source, $block['end']);
                    if ($prop !== null && !isset($byName[$prop['name']])) {
                        $spec['props'][] = $prop;
                        $byName[$prop['name']] = count($spec['props']) - 1;
                    }
                } elseif ($tag['name'] === 'slot') {
                    if (preg_match('/^(\S+)\s*([\s\S]*)$/', $tag['text'], $m)) {
                        $exists = false;
                        foreach ($spec['slots'] as $s) {
                            if ($s['name'] === $m[1]) {
                                $exists = true;
                                break;
                            }
                        }
                        if (!$exists) {
                            $spec['slots'][] = ['name' => $m[1], 'description' => trim($m[2] ?? '')];
                        }
                    }
                } elseif ($tag['name'] === 'example') {
                    if (trim($tag['raw']) !== '') {
                        $spec['examples'][] = trim($tag['raw']);
                    }
                } elseif ($tag['name'] === 'deprecated') {
                    $t = trim($tag['text']);
                    $spec['deprecated'] = $t !== '' ? $t : true;
                }
            }
        }

        // defaults from the code: `$label ??= 'Button';`
        foreach (self::defaults($source) as ['name' => $name, 'expression' => $expression]) {
            if (isset($byName[$name])) {
                $idx = $byName[$name];
                $spec['props'][$idx]['default'] = $expression;
                $spec['props'][$idx]['required'] = false;
            } else {
                $prop = self::newProp($name);
                $prop['inferred'] = true;
                $prop['kind'] = self::kindOf(null, $expression);
                $prop['default'] = $expression;
                $prop['required'] = false;
                $spec['props'][] = $prop;
                $byName[$name] = count($spec['props']) - 1;
            }
        }

        foreach ($spec['props'] as &$prop) {
            self::finish($prop);
        }
        unset($prop);

        // @props{}: its type/required/default/kind win over a docblock's for the same name, but the docblock's own
        // description text is kept if @props{} didn't produce one - same precedence as the JS twin (docblock.js's
        // parseComponent()), so a description can stay hand-written prose even once @props{} is the enforced
        // source of type/required/default for that prop.
        foreach (\CastTemplateEngine\Props::scan($source)['props'] as $p) {
            $type = implode('|', $p['types']) . ($p['nullable'] ? '|null' : '');
            $idx = $byName[$p['name']] ?? null;
            $prop = $idx !== null ? $spec['props'][$idx] : self::newProp($p['name']);
            $oldDescription = $prop['description'];
            $prop['type'] = $type;
            $prop['default'] = $p['default'];
            $prop['required'] = $p['required'];
            $prop['documented'] = true;
            self::finish($prop);
            $prop['required'] = $p['required']; // @props{}'s own rule (no default = required) is explicit, not inferred - finish()'s own heuristic does not apply here
            if ($oldDescription !== '' && $prop['description'] === '') $prop['description'] = $oldDescription;
            if ($idx !== null) {
                $spec['props'][$idx] = $prop;
            } else {
                $spec['props'][] = $prop;
                $byName[$p['name']] = count($spec['props']) - 1;
            }
        }

        return $spec;
    }

    private static function newProp(string $name): array
    {
        return [
            'name' => $name,
            'type' => null,
            'description' => '',
            'required' => false,
            'default' => null,
            'values' => [],
            'kind' => 'other',
            'deprecated' => false,
            'inferred' => false,
        ];
    }

    private static function propFromTag(array $tag, string $source, int $blockEnd): ?array
    {
        $text = trim($tag['text']);
        $type = null;

        if (!str_starts_with($text, '$')) {
            $read = self::readType($text);
            $type = $read['type'];
            $text = trim($read['rest']);
        }

        $name = null;
        if (preg_match('/^\$([A-Za-z_][A-Za-z0-9_]*)\s*([\s\S]*)$/', $text, $named)) {
            $name = $named[1];
            $text = $named[2] ?? '';
        } else {
            // an inline `/** @var string The label */` belongs to the variable assigned right after it
            $rest = substr($source, $blockEnd);
            if (!preg_match('/^\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*(?:\?\?=|=)/', $rest, $next)) {
                return null;
            }
            $name = $next[1];
        }

        $prop = self::newProp($name);
        $prop['type'] = $type;
        $prop['description'] = trim((string) preg_replace('/^[-\x{2013}\x{2014}]\s*/u', '', $text));
        $prop['required'] = true; // until the type or a default says otherwise (see finish)
        $prop['documented'] = true;

        return $prop;
    }

    /** The type at the start of `text`: balanced <>, (), {}, quotes; unions may have spaces around | and &. */
    public static function readType(string $text): array
    {
        $i = 0;
        $depth = 0;
        $quote = null;
        $n = strlen($text);

        while ($i < $n) {
            $c = $text[$i];
            if ($quote !== null) {
                if ($c === '\\') {
                    $i++;
                } elseif ($c === $quote) {
                    $quote = null;
                }
            } elseif ($c === "'" || $c === '"') {
                $quote = $c;
            } elseif (strpos('<({[', $c) !== false) {
                $depth++;
            } elseif (strpos('>)}]', $c) !== false) {
                $depth--;
            } elseif (ctype_space($c) && $depth <= 0) {
                // a space ends the type unless a | or & joins the next part
                $rest = ltrim(substr($text, $i));
                $before = rtrim(substr($text, 0, $i));
                if (preg_match('/^[|&]/', $rest) || preg_match('/[|&:]$/', $before)) {
                    $i++;
                    continue;
                }
                break;
            }
            $i++;
        }

        $type = trim(substr($text, 0, $i));

        return [
            'type' => $type !== '' ? $type : null,
            'rest' => substr($text, $i),
        ];
    }

    /** Every `/** ... *​/` block with its cleaned-up summary and tags. */
    private static function docblocks(string $source): array
    {
        $out = [];
        if (!preg_match_all('/\/\*\*([\s\S]*?)\*\//', $source, $matches, PREG_OFFSET_CAPTURE)) {
            return $out;
        }

        foreach ($matches[0] as $i => [$full, $fullOffset]) {
            $inner = $matches[1][$i][0];

            $lines = array_map(static function (string $l): string {
                $l = (string) preg_replace('/^\s*\*? ?/', '', $l);
                return (string) preg_replace('/\s+$/', '', $l);
            }, explode("\n", $inner));

            $summary = [];
            $tags = [];
            $currentIdx = null;

            foreach ($lines as $line) {
                if (preg_match('/^@([A-Za-z][A-Za-z0-9_-]*)\s?(.*)$/', $line, $t)) {
                    $text = $t[2] ?? '';
                    $tags[] = ['name' => strtolower($t[1]), 'text' => $text, 'raw' => $text];
                    $currentIdx = count($tags) - 1;
                } elseif ($currentIdx !== null) {
                    $tags[$currentIdx]['raw'] .= "\n" . $line;
                    if (trim($line) !== '') {
                        $tags[$currentIdx]['text'] .= ($tags[$currentIdx]['text'] !== '' ? ' ' : '') . trim($line);
                    }
                } else {
                    $summary[] = $line;
                }
            }

            $summaryText = trim(implode("\n", $summary));
            $summaryText = (string) preg_replace('/\n{2,}/', "\n\n", $summaryText);

            $out[] = [
                'summary' => $summaryText,
                'tags' => $tags,
                'end' => $fullOffset + strlen($full),
            ];
        }

        return $out;
    }

    /** `$name ??= expression;` assignments, with the expression read up to its `;` (strings and brackets aware). */
    private static function defaults(string $source): array
    {
        $found = [];
        $pos = 0;
        $len = strlen($source);

        while ($pos < $len && preg_match('/\$([A-Za-z_][A-Za-z0-9_]*)\s*\?\?=\s*/', $source, $m, PREG_OFFSET_CAPTURE, $pos)) {
            $name = $m[1][0];
            $start = $m[0][1] + strlen($m[0][0]);
            $end = self::expressionEnd($source, $start);
            $expression = trim(substr($source, $start, $end - $start));
            $expression = (string) preg_replace('/\s+/', ' ', $expression);
            $found[] = ['name' => $name, 'expression' => $expression];
            $pos = $end;
        }

        return $found;
    }

    private static function expressionEnd(string $src, int $i): int
    {
        $depth = 0;
        $quote = null;
        $n = strlen($src);

        for (; $i < $n; $i++) {
            $c = $src[$i];
            if ($quote !== null) {
                if ($c === '\\') {
                    $i++;
                } elseif ($c === $quote) {
                    $quote = null;
                }
            } elseif ($c === "'" || $c === '"') {
                $quote = $c;
            } elseif (strpos('([{', $c) !== false) {
                $depth++;
            } elseif (strpos(')]}', $c) !== false) {
                $depth--;
            } elseif ($c === ';' && $depth <= 0) {
                return $i;
            } elseif ($c === '?' && $depth <= 0 && $i + 1 < $n && $src[$i + 1] === '>') {
                return $i;
            }
        }

        return $i;
    }

    /** Fill in what follows from the type and the description: required, kind, allowed values, deprecation. */
    public static function finish(array &$prop): void
    {
        $types = self::splitUnion($prop['type']);
        $optionalType = false;
        foreach ($types as $t) {
            if (preg_match('/^(null|mixed)$/i', $t)) {
                $optionalType = true;
                break;
            }
        }
        if (!$optionalType && $prop['type'] !== null && str_starts_with($prop['type'], '?')) {
            $optionalType = true;
        }

        $documented = $prop['documented'] ?? false;
        if ($documented) {
            $prop['kind'] = self::kindOf($prop['type'], $prop['default']);
            // a flag that is left out is simply false, so a bool is never required
            $prop['required'] = !(
                $optionalType
                || $prop['default'] !== null
                || preg_match('/\[optional\]/i', $prop['description']) === 1
                || $prop['kind'] === 'bool'
            );
        } else {
            $prop['required'] = false;
            $prop['kind'] = self::kindOf($prop['type'], $prop['default']);
        }

        $literals = [];
        foreach ($types as $t) {
            $stripped = self::stripQuotes($t);
            if ($stripped !== null) {
                $literals[] = $stripped;
            }
        }
        $nonNull = array_values(array_filter($types, static fn (string $t): bool => !preg_match('/^null$/i', $t)));

        if (count($literals) > 0 && count($literals) === count($nonNull)) {
            $prop['values'] = $literals;
        } elseif ($prop['kind'] === 'string' || $prop['kind'] === 'other') {
            $prop['values'] = self::valuesFromDescription($prop['description']);
        }

        // "Deprecated: use x", or an inline "@deprecated use x" anywhere in the description
        $dep = null;
        if (preg_match('/^\s*deprecated\b:?\s*([\s\S]*)$/i', $prop['description'], $dm)) {
            $dep = $dm;
        } elseif (preg_match('/(?:^|\s)@deprecated\b:?\s*([\s\S]*)$/i', $prop['description'], $dm)) {
            $dep = $dm;
        }
        if ($dep !== null) {
            $text = trim($dep[1]);
            $prop['deprecated'] = $text !== '' ? $text : true;
        }

        unset($prop['documented']);
    }

    public static function splitUnion(?string $type): array
    {
        if ($type === null || $type === '') {
            return [];
        }
        $t = trim($type);
        if (str_starts_with($t, '?')) {
            $t = substr($t, 1) . '|null';
        }

        $parts = [];
        $depth = 0;
        $quote = null;
        $start = 0;
        $n = strlen($t);

        for ($i = 0; $i < $n; $i++) {
            $c = $t[$i];
            if ($quote !== null) {
                if ($c === '\\') {
                    $i++;
                } elseif ($c === $quote) {
                    $quote = null;
                }
            } elseif ($c === "'" || $c === '"') {
                $quote = $c;
            } elseif (strpos('<({[', $c) !== false) {
                $depth++;
            } elseif (strpos('>)}]', $c) !== false) {
                $depth--;
            } elseif ($c === '|' && $depth === 0) {
                $parts[] = trim(substr($t, $start, $i - $start));
                $start = $i + 1;
            }
        }
        $parts[] = trim(substr($t, $start));

        return array_values(array_filter($parts, static fn (string $p): bool => $p !== ''));
    }

    private static function stripQuotes(string $t): ?string
    {
        if (preg_match('/^([\'"])(.*)\1$/', $t, $m)) {
            return $m[2];
        }

        return null;
    }

    private static function kindOf(?string $type, ?string $defaultExpression): string
    {
        $types = array_values(array_filter(
            self::splitUnion($type),
            static fn (string $t): bool => !preg_match('/^null$/i', $t)
        ));

        if (count($types) > 0) {
            $allBool = true;
            $allNumber = true;
            $allString = true;
            foreach ($types as $t) {
                if (!preg_match('/^(bool|boolean|true|false)$/i', $t)) {
                    $allBool = false;
                }
                if (!preg_match('/^(int|integer|float|double|numeric|positive-int|negative-int|int<.*>)$/i', $t)) {
                    $allNumber = false;
                }
                if (!(preg_match('/^(string|non-empty-string|class-string|numeric-string)$/i', $t) || self::stripQuotes($t) !== null)) {
                    $allString = false;
                }
            }
            if ($allBool) {
                return 'bool';
            }
            if ($allNumber) {
                return 'number';
            }
            if ($allString) {
                return 'string';
            }

            return 'other';
        }

        // no type: guess from the default
        $d = trim((string) $defaultExpression);
        if (preg_match('/^(true|false)$/i', $d)) {
            return 'bool';
        }
        if (preg_match('/^-?\d+(\.\d+)?$/', $d)) {
            return 'number';
        }
        if (preg_match('/^([\'"]).*\1$/', $d)) {
            return 'string';
        }

        return 'other';
    }

    /** Quoted or backticked words after "e.g.", "one of", "such as", "values:" or inside the first parentheses. */
    private static function valuesFromDescription(string $description): array
    {
        if ($description === '') {
            return [];
        }

        $region = null;
        if (preg_match('/(?:\be\.g\.?,?|\bone of|\bsuch as|\bvalues?:|\boptions?:|\bpossible values?:)\s*([\s\S]*)$/i', $description, $lead)) {
            $region = $lead[1];
        } elseif (preg_match('/\(([^)]*)\)/', $description, $paren)) {
            $region = $paren[1];
        }
        if ($region === null) {
            return [];
        }

        $values = [];
        if (preg_match_all('/"([^"]+)"|\'([^\']+)\'|`([^`]+)`/', $region, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $m) {
                $v = $m[1] ?? $m[2] ?? $m[3] ?? null;
                if ($v !== null && !in_array($v, $values, true)) {
                    $values[] = $v;
                }
            }
        }

        return count($values) <= 20 ? $values : [];
    }

    /** The attribute spellings the engine treats as the same prop (`has-label`, `has_label`, `hasLabel`). */
    public static function camel(string $name): string
    {
        $name = (string) preg_replace_callback('/[-_]+([A-Za-z0-9])/', static fn (array $m): string => strtoupper($m[1]), $name);

        return (string) preg_replace_callback('/^[A-Z]/', static fn (array $m): string => strtolower($m[0]), $name);
    }
}
