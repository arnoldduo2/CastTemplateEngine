<?php

declare(strict_types=1);

namespace CastTemplateEngine;

/**
 * Turns a template with component tags into plain PHP.
 *
 * Markup:
 *   <Form.KpiCard title="Sales" total={$total} active>children</Form.KpiCard>
 *   <Badge text={$name} />
 *   <Slot name="left">html for the "left" prop</Slot>
 *   <option data-html={<Badge text={$name} />} disabled={$locked}>   (escaped)
 *
 * Left untouched: <?php ?>, <?= ?>, <script>, <style>, <!-- -->, text content.
 */
final class Compiler
{
    private const NAME = '[A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)*';

    private string $src = '';
    private int $len = 0;
    private int $pos = 0;
    private string $out = '';
    /** @var list<array{string, int}> open tags: [name, line] */
    private array $open = [];
    /** line where the expression being compiled starts, for error messages */
    private int $exprLine = 0;

    public function __construct(
        private string $componentsDir,
        private string $ext = '.cast.php',
        private string $file = 'template',
    ) {}

    public function compile(string $source): string
    {
        $this->src = $source;
        $this->len = strlen($source);
        $this->pos = 0;
        $this->out = '';
        $this->open = [];

        while ($this->pos < $this->len) {
            $lt = strpos($this->src, '<', $this->pos);
            if ($lt === false) {
                $this->out .= substr($this->src, $this->pos);
                break;
            }
            $this->out .= substr($this->src, $this->pos, $lt - $this->pos);
            $this->pos = $lt;

            if ($this->copyRaw('<?', '?>')
                || $this->copyRaw('<!--', '-->')
                || $this->copyRawElement('script')
                || $this->copyRawElement('style')
                || $this->componentTag()
                || $this->htmlTag()
            ) {
                continue;
            }

            $this->out .= '<';
            $this->pos++;
        }

        if ($this->open) {
            [$name, $line] = end($this->open);
            $this->fail("<$name> is never closed", $line);
        }

        return $this->out;
    }

    /**
     * `KpiCard` => first existing of kpi-card, kpi_card, KpiCard, kpiCard (.php).
     * Dots are folders, resolved the same way. Returns the path relative to the
     * components folder (without extension) or null.
     */
    public function resolve(string $tag, ?array &$tried = null): ?string
    {
        $tried = [];
        $dir = rtrim($this->componentsDir, '/\\');
        $segments = explode('.', $tag);
        $path = [];

        foreach ($segments as $i => $segment) {
            $last = $i === count($segments) - 1;
            $found = null;
            foreach (self::variants($segment) as $variant) {
                $candidate = $dir . '/' . $variant . ($last ? $this->ext : '');
                $tried[] = implode('/', [...$path, $variant]) . ($last ? $this->ext : '/');
                if ($last ? is_file($candidate) : is_dir($candidate)) {
                    $found = $variant;
                    break;
                }
            }
            if ($found === null) return null;
            $dir .= '/' . $found;
            $path[] = $found;
        }

        return implode('/', $path);
    }

    /** @return list<string> */
    private static function variants(string $name): array
    {
        $words = strtolower(preg_replace('/(?<=[a-z0-9])(?=[A-Z])/', ' ', $name));
        return array_values(array_unique([
            str_replace(' ', '-', $words),
            str_replace(' ', '_', $words),
            $name,
            lcfirst($name),
        ]));
    }

    // ------------------------------------------------------------------ markup

    private function copyRaw(string $start, string $end): bool
    {
        if (substr_compare($this->src, $start, $this->pos, strlen($start)) !== 0) return false;
        $close = strpos($this->src, $end, $this->pos + strlen($start));
        $stop = $close === false ? $this->len : $close + strlen($end);
        $this->out .= substr($this->src, $this->pos, $stop - $this->pos);
        $this->pos = $stop;
        return true;
    }

    /** `<script>` and `<style>` are copied as-is up to their closing tag. */
    private function copyRawElement(string $tag): bool
    {
        if (!preg_match('/\G<' . $tag . '\b/i', $this->src, $m, 0, $this->pos)) return false;
        $close = stripos($this->src, "</$tag", $this->pos);
        $stop = $close === false ? $this->len : $close;
        $this->out .= substr($this->src, $this->pos, $stop - $this->pos);
        $this->pos = $stop;
        return true;
    }

    private function componentTag(): bool
    {
        if (!preg_match('/\G<(\/?)(' . self::NAME . ')(?=[\s\/>])/', $this->src, $m, 0, $this->pos)) return false;

        [$match, $closing, $name] = $m;
        $start = $this->pos;
        $line = $this->line($start);
        $this->pos += strlen($match);

        if ($closing) {
            $this->skipSpace();
            if (($this->src[$this->pos] ?? '') !== '>') $this->fail("Expected \">\" after </$name", $line);
            $this->pos++;
            $last = array_pop($this->open);
            if (!$last || $last[0] !== $name) {
                $this->fail("Unexpected </$name>" . ($last ? ", expected </{$last[0]}>" : ''), $line);
            }
            $code = $name === 'Slot'
                ? '<?php $this->endSlot(); ?>'
                : '<?= $this->close() ?>';
            return $this->emit($code, $start);
        }

        if ($name === 'Slot') {
            [$props, $selfClosing] = $this->attributes($name);
            if ($selfClosing || !preg_match("/^\['name' => ('[^']*')\]$/", $props, $s)) {
                $this->fail('<Slot> needs a literal name="..." and a closing </Slot>', $line);
            }
            if (!$this->open || end($this->open)[0] === 'Slot') {
                $this->fail('<Slot> must be placed directly inside a component', $line);
            }
            $this->open[] = [$name, $line];
            return $this->emit("<?php \$this->slot({$s[1]}); ?>", $start);
        }

        $path = $this->resolveOrFail($name, $line);
        [$props, $selfClosing] = $this->attributes($name);

        if ($selfClosing) {
            return $this->emit("<?= \$this->component($path, $props) ?>", $start);
        }
        $this->open[] = [$name, $line];
        return $this->emit("<?php \$this->open($path, $props); ?>", $start);
    }

    /**
     * Plain HTML tag: copied as written, except `attr={expr}` which becomes an
     * escaped attribute (true => bare attribute, false/null => removed).
     */
    private function htmlTag(): bool
    {
        if (!preg_match('/\G<[a-z][a-zA-Z0-9-]*(?=[\s\/>])/', $this->src, $m, 0, $this->pos)) return false;

        $this->out .= $m[0];
        $this->pos += strlen($m[0]);

        while ($this->pos < $this->len) {
            $this->out .= $this->space();
            $c = $this->src[$this->pos] ?? '';

            if ($c === '>' || $c === '/' || $c === '<' && ($this->src[$this->pos + 1] ?? '') !== '?') {
                // end of tag, or a stray "<" (e.g. "a<b" in text): stop here
                return true;
            }
            if ($c === '<') {
                $this->copyRaw('<?', '?>');
                continue;
            }
            if (!preg_match('/\G[^\s=\/>"\'<]+/', $this->src, $a, 0, $this->pos)) {
                $this->out .= $c;
                $this->pos++;
                continue;
            }

            $attr = $a[0];
            $start = $this->pos;
            $this->pos += strlen($attr);
            $before = $this->space();

            if (($this->src[$this->pos] ?? '') !== '=') {
                $this->out .= $attr . $before;
                continue;
            }
            $this->pos++;
            $after = $this->space();
            $c = $this->src[$this->pos] ?? '';

            if ($c === '{') {
                $expr = $this->expression($this->braces());
                $this->emit('<?= $this->attr(' . var_export($attr, true) . ", ($expr)) ?>", $start);
            } elseif ($c === '"' || $c === "'") {
                $line = $this->line($this->pos);
                $value = $this->quoted($c);
                $this->noTagsInQuotes($value, $attr, $line);
                $this->out .= "$attr$before=$after$c$value$c";
            } else {
                preg_match('/\G[^\s>]*/', $this->src, $v, 0, $this->pos);
                $this->pos += strlen($v[0]);
                $this->out .= "$attr$before=$after$v[0]";
            }
        }
        return true;
    }

    // -------------------------------------------------------------- attributes

    /** @return array{string, bool} PHP array literal of the props, self-closing flag */
    private function attributes(string $tag): array
    {
        $items = [];
        while (true) {
            $this->skipSpace();
            if ($this->pos >= $this->len) $this->fail("Unterminated <$tag> tag");

            if (substr_compare($this->src, '/>', $this->pos, 2) === 0) {
                $this->pos += 2;
                return ['[' . implode(', ', $items) . ']', true];
            }
            if ($this->src[$this->pos] === '>') {
                $this->pos++;
                return ['[' . implode(', ', $items) . ']', false];
            }

            if ($this->src[$this->pos] === '{') {
                $expr = trim($this->expression($this->braces()));
                if (!str_starts_with($expr, '...')) $this->fail("Expected {...\$props} in <$tag>, got {{$expr}}");
                $items[] = $expr;
                continue;
            }

            if (!preg_match('/\G[A-Za-z_][\w\-:.]*/', $this->src, $m, 0, $this->pos)) {
                $this->fail("Invalid attribute in <$tag> near \"" . substr($this->src, $this->pos, 20) . '"');
            }
            $key = var_export($m[0], true);
            $this->pos += strlen($m[0]);

            $this->skipSpace();
            if (($this->src[$this->pos] ?? '') !== '=') {
                $items[] = "$key => true";
                continue;
            }
            $this->pos++;
            $this->skipSpace();

            $c = $this->src[$this->pos] ?? '';
            if ($c === '{') {
                $items[] = "$key => (" . $this->expression($this->braces()) . ')';
            } elseif ($c === '"' || $c === "'") {
                $line = $this->line($this->pos);
                $value = $this->quoted($c);
                $this->noTagsInQuotes($value, $m[0], $line);
                $items[] = "$key => " . $this->stringValue($value);
            } else {
                $this->fail("Attribute $m[0] in <$tag> needs a \"value\" or {expression}");
            }
        }
    }

    /**
     * Compiles component tags used inside a `{ }` expression, e.g.
     * left={<Badge text={$x} />} or {$ok ? <Yes /> : <No />}.
     * Names that are not components (constants like `$a <MAX`) are left alone.
     */
    private function expression(string $code): string
    {
        $saved = [$this->src, $this->len, $this->pos, $this->exprLine];
        $this->exprLine = $this->exprLine ?: $this->line($this->pos);
        [$this->src, $this->len, $this->pos] = [$code, strlen($code), 0];
        $result = '';

        try {
            while ($this->pos < $this->len) {
                $c = $this->src[$this->pos];
                if ($c === '"' || $c === "'") {
                    $start = $this->pos;
                    $this->quoted($c, true);
                    $result .= substr($this->src, $start, $this->pos - $start);
                    continue;
                }
                if ($c === '<'
                    && preg_match('/\G<(' . self::NAME . ')(?=[\s\/>])/', $this->src, $m, 0, $this->pos)
                    && ($path = $this->resolve($m[1])) !== null
                ) {
                    $this->pos += strlen($m[0]);
                    [$props, $selfClosing] = $this->attributes($m[1]);
                    if (!$selfClosing) {
                        $this->fail("<{$m[1]}> inside { } must be self-closing. Use <Slot> for blocks with children");
                    }
                    $result .= '$this->component(' . var_export($path, true) . ", $props)";
                    continue;
                }
                $result .= $c;
                $this->pos++;
            }
        } finally {
            [$this->src, $this->len, $this->pos, $this->exprLine] = $saved;
        }

        return $result;
    }

    /** Reads `{ ... }` (nested braces and PHP strings aware) and returns the inside. */
    private function braces(): string
    {
        $depth = 0;
        $start = $this->pos;
        while ($this->pos < $this->len) {
            $c = $this->src[$this->pos];
            if ($c === '"' || $c === "'") {
                $this->quoted($c, true);
                continue;
            }
            $this->pos++;
            if ($c === '{') $depth++;
            if ($c === '}' && --$depth === 0) {
                return substr($this->src, $start + 1, $this->pos - $start - 2);
            }
        }
        $this->fail('Unclosed { in attribute', $this->line($start));
    }

    /**
     * Reads a quoted string starting at the current quote and returns its body.
     * $php: PHP string rules (backslash escapes). Otherwise HTML rules, where an
     * embedded echo tag may itself contain quotes.
     */
    private function quoted(string $quote, bool $php = false): string
    {
        $start = ++$this->pos;
        while ($this->pos < $this->len && $this->src[$this->pos] !== $quote) {
            if (!$php && substr_compare($this->src, '<?', $this->pos, 2) === 0) {
                $end = strpos($this->src, '?>', $this->pos);
                $this->pos = $end === false ? $this->len : $end + 2;
            } else {
                $this->pos += ($php && $this->src[$this->pos] === '\\') ? 2 : 1;
            }
        }
        $value = substr($this->src, $start, $this->pos - $start);
        $this->pos++;
        return $value;
    }

    /** "Hello <?= $name ?>!" => 'Hello ' . ($name) . '!' */
    private function stringValue(string $raw): string
    {
        $parts = preg_split('/<\?=\s*(.*?)\s*;?\s*\?>/s', $raw, -1, PREG_SPLIT_DELIM_CAPTURE);
        $code = [];
        foreach ($parts as $i => $part) {
            if ($i % 2) $code[] = "($part)";
            elseif ($part !== '' || count($parts) === 1) $code[] = var_export($part, true);
        }
        return implode(' . ', $code);
    }

    /** A component written inside quotes would be printed as text: point to the {} form. */
    private function noTagsInQuotes(string $value, string $attr, int $line): void
    {
        $text = preg_replace('/<\?.*?\?>/s', '', $value);
        if (preg_match('/<(' . self::NAME . ')[\s\/>]/', $text, $m) && $this->resolve($m[1]) !== null) {
            $this->fail("<{$m[1]}> inside $attr=\"...\" is not compiled. Write $attr={<{$m[1]} ... />} instead", $line);
        }
    }

    // ----------------------------------------------------------------- helpers

    private function resolveOrFail(string $name, int $line): string
    {
        $path = $this->resolve($name, $tried);
        if ($path === null) {
            $this->fail("Component <$name> not found. Looked for: " . implode(', ', $tried), $line);
        }
        return var_export($path, true);
    }

    private function space(): string
    {
        $n = strspn($this->src, " \t\r\n", $this->pos);
        $this->pos += $n;
        return substr($this->src, $this->pos - $n, $n);
    }

    private function skipSpace(): void
    {
        $this->pos += strspn($this->src, " \t\r\n", $this->pos);
    }

    private function line(int $offset): int
    {
        return $this->exprLine ?: substr_count($this->src, "\n", 0, $offset) + 1;
    }

    /** Appends code ending in `?>`, padded with newlines so source line numbers still match. */
    private function emit(string $code, int $start): bool
    {
        $lines = substr_count($this->src, "\n", $start, $this->pos - $start) - substr_count($code, "\n");
        if ($lines > 0) $code = substr($code, 0, -2) . str_repeat("\n", $lines) . '?>';
        $this->out .= $code;
        return true;
    }

    private function fail(string $message, ?int $line = null): never
    {
        $line ??= $this->line($this->pos);
        throw new TemplateError("$message in {$this->file} on line $line");
    }
}
