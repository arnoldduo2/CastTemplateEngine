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
 * The `@` shorthand for PHP (@{ $x }, @foreach (...): ... @endforeach, @if, @for, @while, @forelse) is Directives.
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
    /** @var list<array{string, int, list<string>}> open tags: [name, line, still-missing required prop names (see Props)] */
    private array $open = [];
    /** line where the expression being compiled starts, for error messages */
    private int $exprLine = 0;
    /** @var array<string, string> original class name => scoped name (see Css::scanClassRenames()), computed once per compile() from the raw source */
    private array $classRenames = [];
    /** @var array<string, list<array>> resolved component path => its own fully-merged declared @props{} (see Props::scan(), mergeExtendedProps()), read at most once per compile() */
    private array $targetPropsCache = [];
    /** @var list<string> resolved paths (or $this->file, for the entry file's own block) currently being resolved through an @props extends:: chain, to detect a cycle */
    private array $extendsChain = [];

    public function __construct(
        private string $componentsDir,
        private string $ext = '.cast.php',
        private string $file = 'template',
    ) {}

    public function compile(string $source): string
    {
        $this->classRenames = Css::scanClassRenames($source);
        $source = $this->extractOwnProps($source);   // @props{ ... }, before Directives ever sees it (see Props)
        $source = (new Directives($this->file, $this->classRenames))->compile($source);     // @{ }, @foreach ... @endforeach
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
     * `@props{ ... }` (see Props): scans the raw source for the file's own declaration, rejects it if the file
     * still also uses the legacy `$name ??= ...;` convention for a name it declares (the prelude below already
     * assigns that name unconditionally, so the old line would become silent dead code), and replaces the block
     * *in place* with a prelude of Props::check() calls - not relocated to the very top of the file, since
     * `declare(strict_types=1);` (CastTemplate::compile()'s own cache step strips it via a regex anchored to the
     * start of the file) has to remain the literal first statement a component file's own leading `<?php ?>` block
     * already puts it as. Leaving the prelude exactly where `@props{}` itself was - which Props::scan() already
     * requires to be before any markup - keeps it after any such leading setup code without needing to find or
     * reason about where that code ends. Line-count-preserving the same way emit() already is: the prelude is kept
     * to one PHP statement per line as far as possible, then padded with trailing newlines to match the original
     * block's own newline count, so every later line number is unaffected (a default expression that itself spans
     * multiple lines is the one case this can't fully preserve - an accepted, documented limitation, same style as
     * Css::scanClassRenames()'s own).
     */
    private function extractOwnProps(string $source): string
    {
        $scan = Props::scan($source, $this->file);
        if ($scan['start'] === null) return $source;

        $props = $this->mergeExtendedProps($scan, $this->file, $this->file, $source);
        $this->checkNoLegacyDefaults($source, $props);

        $prelude = $this->emitPropsPrelude($props);
        $spanLines = substr_count($source, "\n", $scan['start'], $scan['end'] - $scan['start']);
        $preludeLines = substr_count($prelude, "\n");
        if ($prelude !== '' && $spanLines > $preludeLines) {
            $prelude = substr($prelude, 0, -2) . str_repeat("\n", $spanLines - $preludeLines) . '?>';
        }

        return substr($source, 0, $scan['start']) . $prelude . substr($source, $scan['end']);
    }

    /** @param list<array{name: string}> $props */
    private function checkNoLegacyDefaults(string $source, array $props): void
    {
        foreach ($props as $p) {
            $pattern = '/\$' . preg_quote($p['name'], '/') . '\s*\?\?=/';
            if (preg_match($pattern, $source, $m, PREG_OFFSET_CAPTURE)) {
                $line = substr_count($source, "\n", 0, $m[0][1]) + 1;
                $this->fail("\${$p['name']} is declared in @props{} and also uses the legacy '\${$p['name']} ??= ...' convention - remove the ??= line, its default now belongs in @props{}", $line);
            }
        }
    }

    /** @param list<array{name: string, types: list<string>, nullable: bool, required: bool, default: ?string, line: int}> $props */
    private function emitPropsPrelude(array $props): string
    {
        if (!$props) return '';
        $file = var_export($this->file, true);
        $stmts = [];
        foreach ($props as $p) {
            $key = var_export($p['name'], true);
            $types = '[' . implode(', ', array_map(static fn(string $t): string => var_export($t, true), $p['types'])) . ']';
            $fallback = $p['default'] !== null ? '(' . $p['default'] . ')' : 'null';
            $required = $p['required'] ? 'true' : 'false';
            $nullable = $p['nullable'] ? 'true' : 'false';
            $stmts[] = "\${$p['name']} = \\CastTemplateEngine\\Props::check($key, array_key_exists($key, \$props) ? \$props[$key] : $fallback, array_key_exists($key, \$props), $required, $types, $nullable, $file, {$p['line']});";
        }
        // one PHP statement per prop, kept on a single line as far as possible - see extractOwnProps() for why
        return '<?php ' . implode(' ', $stmts) . ' ?>';
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
            // a required prop can be supplied by <Slot name="x">...</Slot> instead of an attribute (matches the
            // editor extension's own diagnostic, lib/complete.js's isProvidedBySlot()) - deferred until here, the
            // closing tag, so every <Slot> between open and close has already had its chance to satisfy one; the
            // error still points at the *opening* tag's line, where the component was actually invoked.
            if ($name !== 'Slot' && $last[2]) $this->failMissingProps($name, $last[2], $last[1]);
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
            $slotName = CastTemplate::camel(substr($s[1], 1, -1));
            $parent = array_key_last($this->open);
            $this->open[$parent][2] = array_values(array_filter(
                $this->open[$parent][2],
                static fn(string $p): bool => CastTemplate::camel($p) !== $slotName,
            ));
            $this->open[] = [$name, $line, []];
            return $this->emit("<?php \$this->slot({$s[1]}); ?>", $start);
        }

        $path = $this->resolveOrFail($name, $line, $resolved);
        [$props, $selfClosing, $literalKeys, $hasSpread] = $this->attributes($name);
        $missing = $this->missingRequiredProps($this->declaredPropsOf($resolved), $literalKeys, $hasSpread);

        if ($selfClosing) {
            if ($missing) $this->failMissingProps($name, $missing, $line);
            return $this->emit("<?= \$this->component($path, $props) ?>", $start);
        }
        $this->open[] = [$name, $line, $missing];
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
                $emitAttr = ($attr === 'key') ? 'data-el-key' : $attr;
                $this->emit('<?= $this->attr(' . var_export($emitAttr, true) . ", ($expr)) ?>", $start);
            } elseif ($c === '<' && ($this->src[$this->pos + 1] ?? '') === '?') {
                // a bare attribute value that is itself a short-echo PHP tag (e.g. from an @directive like
                // @route(...)/@htchars(...) used without braces): captured as one atomic unit and quoted, so a
                // result containing a space stays one valid attribute value instead of silently breaking the tag.
                // The braced {attr={...}} form is still preferred - this only makes the bare form safe, it does
                // not escape the result the way $this->attr() does for the braced form.
                $close = strpos($this->src, '?>', $this->pos + 2);
                $end = $close === false ? $this->len : $close + 2;
                $tag = substr($this->src, $this->pos, $end - $this->pos);
                $this->pos = $end;
                $emitAttr = ($attr === 'key') ? 'data-el-key' : $attr;
                $this->out .= "$emitAttr$before=$after\"$tag\"";
            } elseif ($c === '"' || $c === "'") {
                $line = $this->line($this->pos);
                $value = $this->quoted($c);
                $this->noTagsInQuotes($value, $attr, $line);
                if ($attr === 'class' && $this->classRenames) $value = $this->renameClassTokens($value);
                $emitAttr = ($attr === 'key') ? 'data-el-key' : $attr;
                $this->out .= "$emitAttr$before=$after$c$value$c";
            } else {
                $line = $this->line($this->pos);
                preg_match('/\G[^\s>]*/', $this->src, $v, 0, $this->pos);
                $this->pos += strlen($v[0]);
                if (substr_count($v[0], '}') !== substr_count($v[0], '{')) {
                    $this->fail("Attribute $attr is missing its opening { (found \"$v[0]\"). Write $attr={...}", $line);
                }
                $emitAttr = ($attr === 'key') ? 'data-el-key' : $attr;
                $this->out .= "$emitAttr$before=$after$v[0]";
            }
        }
        return true;
    }

    // -------------------------------------------------------------- attributes

    /** @return array{string, bool, list<string>, bool} PHP array literal of the props, self-closing flag, literal attribute names written on the tag, whether a {...$spread} is present */
    private function attributes(string $tag): array
    {
        $items = [];
        $literalKeys = [];
        $hasSpread = false;
        while (true) {
            $this->skipSpace();
            if ($this->pos >= $this->len) $this->fail("Unterminated <$tag> tag");

            if (substr_compare($this->src, '/>', $this->pos, 2) === 0) {
                $this->pos += 2;
                return ['[' . implode(', ', $items) . ']', true, $literalKeys, $hasSpread];
            }
            if ($this->src[$this->pos] === '>') {
                $this->pos++;
                return ['[' . implode(', ', $items) . ']', false, $literalKeys, $hasSpread];
            }

            if ($this->src[$this->pos] === '{') {
                $expr = trim($this->expression($this->braces()));
                if (!str_starts_with($expr, '...')) $this->fail("Expected {...\$props} in <$tag>, got {{$expr}}");
                $items[] = $expr;
                $hasSpread = true;
                continue;
            }

            if (!preg_match('/\G[A-Za-z_][\w\-:.]*/', $this->src, $m, 0, $this->pos)) {
                $this->fail("Invalid attribute in <$tag> near \"" . substr($this->src, $this->pos, 20) . '"');
            }
            $key = var_export($m[0], true);
            $literalKeys[] = $m[0];
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
                    [$props, $selfClosing, $literalKeys, $hasSpread] = $this->attributes($m[1]);
                    if (!$selfClosing) {
                        $this->fail("<{$m[1]}> inside { } must be self-closing. Use <Slot> for blocks with children");
                    }
                    $missing = $this->missingRequiredProps($this->declaredPropsOf($path), $literalKeys, $hasSpread);
                    if ($missing) $this->failMissingProps($m[1], $missing, $this->line($this->pos));
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

    /**
     * Replaces whitespace-separated tokens in a literal `class="..."` value with their Css::scanClassRenames()
     * scoped name where one exists (e.g. `myBtn` -> `a1b2c3d4-myBtn`); a token not declared by any @css() in this
     * file is left exactly as written. Skips over any embedded `<?= ... ?>`/`<?php ... ?>` (left from Directives'
     * `@{ }` pass) rather than rewriting inside it.
     */
    private function renameClassTokens(string $value): string
    {
        return (string) preg_replace_callback(
            '/<\?.*?\?>|[^\s<]+/s',
            fn(array $m): string => $m[0][0] === '<' ? $m[0] : ($this->classRenames[$m[0]] ?? $m[0]),
            $value,
        );
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

    private function resolveOrFail(string $name, int $line, ?string &$raw = null): string
    {
        $raw = $this->resolve($name, $tried);
        if ($raw === null) {
            $this->fail("Component <$name> not found. Looked for: " . implode(', ', $tried), $line);
        }
        return var_export($raw, true);
    }

    /** The target component's own fully-merged declared @props{} (see Props::scan(), mergeExtendedProps()) - a light text read, not a recursive compile; read at most once per resolved path per compile(). @return list<array{name: string, types: list<string>, nullable: bool, required: bool, default: ?string, line: int}> */
    private function declaredPropsOf(string $resolvedPath): array
    {
        if (isset($this->targetPropsCache[$resolvedPath])) return $this->targetPropsCache[$resolvedPath];
        $file = $this->componentsDir . '/' . $resolvedPath . $this->ext;
        $content = is_file($file) ? (string) file_get_contents($file) : '';
        $scan = $content !== '' ? Props::scan($content, $file) : ['props' => [], 'extends' => null, 'start' => null];
        $props = $this->mergeExtendedProps($scan, $resolvedPath, $file, $content);
        return $this->targetPropsCache[$resolvedPath] = $props;
    }

    /**
     * Resolves `@props extends::Dotted.Path{...}` (see Props::scan()'s `extends` key) and merges the base
     * component's own already-merged prop list with this block's own: the base's entries first, in its own order
     * (a name the child redeclares keeps the base's position, but the child's entry - type, default, required -
     * replaces it entirely rather than merging field by field), then any names new to the child, in the order it
     * declared them. A plain @props{} (`extends === null`) is returned unchanged.
     *
     * `$ownerPath` identifies the file *being* scanned (its resolved component path, or `$this->file` for the
     * entry file's own block) and is only used to detect a cycle (an extends:: chain that loops back on itself)
     * via `$this->extendsChain`, pushed/popped around the recursive call into the base. `$ownerFile`/`$ownerSource`
     * are that same file's own name and raw text, used to report a "not found"/"circular" error pointing at its
     * own `@props extends::` line - the same TemplateError convention Props::scan()'s own errors already use -
     * rather than at wherever in some other file this compiler instance happens to be positioned right now.
     * @param array{props: list<array>, extends: ?string, start: ?int} $scan
     * @return list<array>
     */
    private function mergeExtendedProps(array $scan, string $ownerPath, string $ownerFile, string $ownerSource): array
    {
        if ($scan['extends'] === null) return $scan['props'];
        $line = substr_count($ownerSource, "\n", 0, $scan['start']) + 1;

        $basePath = $this->resolve($scan['extends']);
        if ($basePath === null) {
            throw new TemplateError("Component \"{$scan['extends']}\" (used in @props extends::) not found in $ownerFile on line $line", $ownerFile, $line);
        }
        if ($basePath === $ownerPath || in_array($basePath, $this->extendsChain, true)) {
            throw new TemplateError("circular @props extends:: chain involving \"$basePath\" in $ownerFile on line $line", $ownerFile, $line);
        }

        $this->extendsChain[] = $ownerPath;
        try {
            $baseProps = $this->declaredPropsOf($basePath);
        } finally {
            array_pop($this->extendsChain);
        }

        $merged = [];
        foreach ($baseProps as $p) $merged[$p['name']] = $p;
        foreach ($scan['props'] as $p) $merged[$p['name']] = $p;
        return array_values($merged);
    }

    /**
     * The target's own required prop names (camelCased) that are definitely missing from this call: not among the
     * tag's literal attribute names, and no {...$spread} is present that could supply them dynamically (the
     * compiler cannot know what a spread will contain, so it never flags anything when one is present). `children`
     * is excluded - CastTemplate::component() always supplies it.
     * @param list<array{name: string, required: bool}> $declaredProps
     * @param list<string> $literalKeys
     * @return list<string>
     */
    private function missingRequiredProps(array $declaredProps, array $literalKeys, bool $hasSpread): array
    {
        if ($hasSpread) return [];
        $have = array_map([CastTemplate::class, 'camel'], $literalKeys);
        $missing = [];
        foreach ($declaredProps as $p) {
            if (!$p['required'] || $p['name'] === 'children') continue;
            if (!in_array(CastTemplate::camel($p['name']), $have, true)) $missing[] = $p['name'];
        }
        return $missing;
    }

    private function failMissingProps(string $tagName, array $missing, int $line): void
    {
        $s = count($missing) > 1 ? 's' : '';
        $this->fail("<$tagName> is missing required prop$s \"" . implode('", "', $missing) . '"', $line);
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
        throw new TemplateError("$message in {$this->file} on line $line", $this->file, $line);
    }

    /**
     * Statically lints a Cast template source without executing PHP.
     * Returns a list of errors and warnings.
     *
     * @return list<array{type: 'error'|'warning', message: string, line: int, file: string}>
     */
    public static function lint(string $source, string $file = 'template', string $componentsDir = ''): array
    {
        $problems = [];

        // Check for missing key={...} in @map / @filter calls
        $lines = explode("\n", $source);
        foreach ($lines as $lineNum => $lineContent) {
            if (preg_match('/(?:@map|@filter|\.map)\s*\(/', $lineContent)) {
                // If a component or HTML tag is rendered inside without key= or data-el-key=
                if (preg_match('/<([A-Za-z0-9_\-.:]+)/', $lineContent, $tm) && !str_contains($lineContent, 'key=') && !str_contains($lineContent, 'data-el-key=')) {
                    $problems[] = [
                        'type' => 'warning',
                        'message' => 'Missing key: Provide a unique "key={...}" for mapped items to ensure stable identity and prevent UI glitches.',
                        'line' => $lineNum + 1,
                        'file' => $file,
                    ];
                }
            }
        }

        // Check directive and template syntax compilation
        try {
            $compiler = new self($componentsDir ?: sys_get_temp_dir(), '.cast.php', $file);
            $compiler->compile($source);
        } catch (TemplateError $e) {
            $line = 1;
            if (preg_match('/on line (\d+)/', $e->getMessage(), $m)) {
                $line = (int) $m[1];
            }
            $problems[] = [
                'type' => 'error',
                'message' => $e->getMessage(),
                'line' => $line,
                'file' => $file,
            ];
        } catch (\Throwable $e) {
            $problems[] = [
                'type' => 'error',
                'message' => $e->getMessage(),
                'line' => 1,
                'file' => $file,
            ];
        }

        return $problems;
    }
}
