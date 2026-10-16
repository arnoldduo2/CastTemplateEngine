<?php

declare(strict_types=1);

namespace CastTemplateEngine;

/**
 * The `@` shorthand for PHP in a template. It runs before the component tags are compiled and turns
 *
 *   @{ $user->name }                       <?= $user->name ?>           (printed as is, like <?= ?>: escape with htchars() when needed)
 *   @for ($i = 0; $i < 3; $i++):           <?php for ($i = 0; $i < 3; $i++): ?>       ... @endfor
 *   @foreach ($users as $user):            ... @endforeach
 *   @forelse ($users as $user):  ... @empty ... @endforelse     (the @empty part shows when there was nothing to loop over)
 *   @while ($row = next()): ... @endwhile
 *   @if ($a): ... @elseif ($b): ... @else: ... @endif
 *   @unless ($ok): ... @endunless          if (!($ok)) ...
 *   @isset ($x): ... @endisset             if (isset($x)) ...
 *   @switch ($n): @case (1) ... @break @case (2) ... @break @default ... @endswitch
 *   @break  @continue  @break($done)  @continue($skip)       (break / continue, optionally with a condition)
 *   @php($n = 5)    and    @php ... @endphp                 a PHP statement, or a block of plain PHP (nothing inside is changed)
 *   @map($items, ($item, $i) => return(<Card key={$i}>...</Card>))
 *   @filter($items, ($item) => $item->qty > 0)
 *   @$items.filter(...).map(...)
 *   @@                                      a literal @
 *
 * Strict directive validation: unknown directives raise TemplateError with file and line.
 */
final class Directives
{
    private const OPEN = ['for', 'foreach', 'forelse', 'while', 'if'];
    private const WORD = '(forelse|foreach|elseif|endforelse|endforeach|endswitch|endunless|endisset|endwhile|endphp|endfor|endif|switch|unless|isset|default|empty|else|case|for|while|if|php|break|continue|map|filter|scripts|styles|script|js|css)';
    private const CSS_RULES = '(media|import|keyframes|charset|font-face|supports|page|namespace|layer|container|property|scope|starting-style|view-transition)';

    /**
     * Framework-level helper functions usable as bare `@name(...)`/`@name` directives (e.g. `@htchars(...)`,
     * `@route(...)`, `@alerts`, `@csrf`), compiled as an echoed call to the mapped function - `@name(args)`
     * becomes `<?= fn(args) ?>`, `@name` with no `(` becomes `<?= fn() ?>`. A curated whitelist, not a blanket
     * "any unknown @word(...) is a function call" fallback: an actual typo (e.g. `@fitler(...)`) still fails
     * loudly at compile time with "Unknown directive", the same safety @map/@filter/etc. already have. Add an
     * entry here to make another framework helper usable this way.
     */
    private const FUNCTION_DIRECTIVES = [
        'htchars' => 'htchars',
        'route' => 'route',
        'cast' => '__cast',
        'csrf' => '__csrf',
        'alerts' => '__getAlerts',
        'modules' => '__modules',
    ];

    private string $src = '';
    private int $len = 0;
    private int $pos = 0;
    private int $counter = 0;
    /** where the last directive ended, so @endif@endforeach is two directives and not an e-mail address */
    private int $lastEnd = -1;
    private bool $afterSwitch = false;
    /** @var list<array{string, int, int, bool}> open blocks: [directive, line, id, seen @empty] */
    private array $stack = [];

    /**
     * @param array<string, string> $classRenames original class name => scoped name, see Css::scanClassRenames()
     * @param int $lineOffset for a Directives instance compiling an EXTRACTED substring (a @map/@filter callback's
     *   body, or a return(...)/@render(...) inline-render's markup) rather than a whole file: the line, minus 1,
     *   where that substring starts in the real file - so errors inside it report the real line, not a line
     *   number counted from the start of the substring.
     */
    public function __construct(private string $file = 'template', private array $classRenames = [], private int $lineOffset = 0) {}

    public function compile(string $source): string
    {
        if (!str_contains($source, '@')) return $source;

        $this->src = $source;
        $this->len = strlen($source);
        $this->pos = 0;
        $this->stack = [];
        $this->lastEnd = -1;
        $out = $this->run(true);

        if ($this->stack) {
            [$name, $line] = end($this->stack);
            $this->fail("@$name is never closed", $line);
        }
        return $out;
    }

    /** The real-file line (accounting for $lineOffset) at a position in $this->src. */
    private function lineAt(int $pos): int
    {
        return $this->lineOffset + substr_count($this->src, "\n", 0, $pos) + 1;
    }

    /**
     * The real-file line where $needle - an exact substring of $haystack - starts, given that $haystack itself
     * starts at $baseLine. Used to find where a piece extracted from a larger piece of text (a callback's body
     * within its full argument list, a return(...)'s markup within its surrounding code) really begins, without
     * having to thread exact byte offsets through every intermediate trim()/regex extraction.
     */
    private function lineOfOffset(string $haystack, string $needle, int $baseLine): int
    {
        $pos = strpos($haystack, $needle);
        return $pos === false ? $baseLine : $baseLine + substr_count($haystack, "\n", 0, $pos);
    }

    /** Converts from $this->pos up to the end (or the end of the <style> block when $until is set). */
    private function run(bool $directives, ?int $until = null): string
    {
        $end = $until ?? $this->len;
        $out = '';
        while ($this->pos < $end) {
            if (!preg_match($directives ? '/<\?|<style\b|@/i' : '/@\{|@@/', $this->src, $m, PREG_OFFSET_CAPTURE, $this->pos) || $m[0][1] >= $end) {
                $out .= substr($this->src, $this->pos, $end - $this->pos);
                $this->pos = $end;
                break;
            }
            [$token, $at] = $m[0];
            $at = (int) $at;
            $out .= substr($this->src, $this->pos, $at - $this->pos);
            $this->pos = $at;

            if ($token === '<?') {
                $close = strpos($this->src, '?>', $at + 2);
                $stop = $close === false ? $this->len : $close + 2;
                $out .= substr($this->src, $at, $stop - $at);
                $this->pos = $stop;
            } elseif ($token !== '@' && $token !== '@{' && $token !== '@@') {          // <style ...>
                $close = stripos($this->src, '</style', $at);
                $stop = $close === false ? $this->len : $close;
                $tagEnd = strpos($this->src, '>', $at);
                $head = $tagEnd === false || $tagEnd >= $stop ? $stop : $tagEnd + 1;
                $out .= substr($this->src, $at, $head - $at);
                $this->pos = $head;
                $out .= $this->run(false, $stop);        // CSS has its own @ rules: only @{ } and @@ are ours there
            } else {
                $out .= $this->at($directives);
            }
        }
        return $out;
    }

    /** Handles the `@` at $this->pos. */
    private function at(bool $directives): string
    {
        $p = $this->pos;
        if (substr($this->src, $p, 2) === '@@') {
            $this->pos += 2;
            return '@';
        }
        if (($this->src[$p + 1] ?? '') === '{') {
            $code = $this->balanced($p + 1, '{', '}');
            $this->pos = $p + 1 + strlen($code) + 2;
            $this->lastEnd = $this->pos;
            return $this->echo($code, $this->lineAt($p + 1));
        }

        $before = $p > 0 ? $this->src[$p - 1] : '';
        if ($p !== $this->lastEnd && $before !== '' && (ctype_alnum($before) || $before === '.' || $before === '_')) {
            $this->pos++;
            return '@';                                  // an e-mail address, not ours
        }

        // CSS @rules
        if (preg_match('/\G@' . self::CSS_RULES . '\b/i', $this->src, $m, 0, $p)) {
            $this->pos++;
            return '@';
        }

        $line = $this->lineAt($p);

        // Check for chained collection calls: e.g. @$items.filter(...).map(...) or @items.map(...)
        if (preg_match('/\G@(\$?[A-Za-z_][A-Za-z0-9_]*)\s*\.\s*(filter|map)\b/', $this->src, $m, 0, $p)) {
            return $this->handleChain($m[1], $line);
        }

        if (!$directives || !preg_match('/\G@' . self::WORD . '\b/', $this->src, $m, 0, $p)) {
            // A whitelisted framework helper, e.g. @htchars(...), @route(...), @alerts, @csrf - see FUNCTION_DIRECTIVES.
            if (preg_match('/\G@([A-Za-z_][A-Za-z0-9_]*)\b/', $this->src, $fm, 0, $p) && isset(self::FUNCTION_DIRECTIVES[$fm[1]])) {
                return $this->functionDirective($fm[1], $fm[0], $line);
            }
            // If it looks like a directive call @foo(...) or an unclosed/unknown @end...
            if (preg_match('/\G@([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(|(?<=@end)[A-Za-z0-9_]+)/', $this->src, $unrecognized, 0, $p)) {
                $this->fail("Unknown directive \"@{$unrecognized[1]}\"", $line);
            }
            $this->pos++;
            return '@';
        }

        $word = $m[1];
        $this->pos = $p + strlen($m[0]);

        $arg = null;
        if ($word === 'php' && !preg_match('/\G[ \t]*\(/', $this->src, $_, 0, $this->pos)) return $this->phpBlock($line);
        if (in_array($word, ['for', 'foreach', 'forelse', 'while', 'if', 'elseif', 'unless', 'isset', 'switch', 'case', 'php', 'map', 'filter', 'script', 'js', 'css'], true)) {
            $arg = $this->parenthesised($word, $line);
        } elseif (in_array($word, ['break', 'continue'], true)) {
            $arg = $this->optionalParenthesised();
        }
        $this->optionalColon();

        $code = $this->emit($word, $arg, $line);
        $this->lastEnd = $this->pos;
        return $code;
    }

    /**
     * Handles fluent collection chains: @$items.filter(...).map(...)
     */
    private function handleChain(string $varName, int $line): string
    {
        $var = str_starts_with($varName, '$') ? $varName : '$' . $varName;
        // Skip @ and varName
        $this->pos += 1 + strlen($varName);

        $target = $var;

        while (preg_match('/\G\s*\.\s*(filter|map)\b/', $this->src, $m, 0, $this->pos)) {
            $method = $m[1];
            $this->pos += strlen($m[0]);
            $argsStr = $this->parenthesised($method, $line);
            $parsed = $this->transformCallback($argsStr, $line);

            if ($method === 'filter') {
                $target = "\\CastTemplateEngine\\Collection::filter($target, {$parsed['code']})";
            } else {
                $target = "\\CastTemplateEngine\\Collection::map($target, {$parsed['code']})";
            }
        }

        $this->optionalColon();
        $this->lastEnd = $this->pos;
        return "<?= $target ?>";
    }

    /** A whitelisted framework-helper directive (FUNCTION_DIRECTIVES): `@name(args)` or bare `@name` -> `<?= fn(args) ?>`/`<?= fn() ?>`. */
    private function functionDirective(string $word, string $matched, int $line): string
    {
        $this->pos += strlen($matched);
        $fn = self::FUNCTION_DIRECTIVES[$word];
        $args = preg_match('/\G\s*\(/', $this->src, $_, 0, $this->pos) ? $this->parenthesised($word, $line) : '';
        $this->lastEnd = $this->pos;
        return $this->echo("$fn($args)", $line);
    }

    /** `@php ... @endphp`: the code between is copied as it is. */
    private function phpBlock(int $line): string
    {
        if (!preg_match('/@endphp\b/', $this->src, $m, PREG_OFFSET_CAPTURE, $this->pos)) $this->fail('@php is never closed (end it with @endphp)', $line);
        $code = substr($this->src, $this->pos, $m[0][1] - $this->pos);
        $this->pos = $m[0][1] + strlen($m[0][0]);
        $this->lastEnd = $this->pos;
        return '<?php' . (str_starts_with($code, "\n") || str_starts_with($code, ' ') ? '' : ' ') . $code . ' ?>';
    }

    private function emit(string $word, ?string $arg, int $line): string
    {
        switch ($word) {
            case 'for':
            case 'foreach':
            case 'while':
            case 'if':
                $this->stack[] = [$word, $line, 0, false];
                return "<?php $word ($arg): ?>";
            case 'unless':
            case 'isset':
                $this->stack[] = [$word, $line, 0, false];
                return $word === 'unless' ? "<?php if (!($arg)): ?>" : "<?php if (isset($arg)): ?>";
            case 'switch':
                $this->stack[] = ['switch', $line, 0, false];
                // PHP allows nothing but whitespace between `switch (...):` and the first `case`: keep that gap inside the tag
                $gap = preg_match('/\G\s*/', $this->src, $g, 0, $this->pos) ? $g[0] : '';
                $this->pos += strlen($gap);
                if (!preg_match('/\G@(case|default)\b/', $this->src, $_, 0, $this->pos)) $this->fail('@switch must be followed by @case or @default', $line);
                $this->afterSwitch = true;
                return "<?php switch ($arg):" . $gap;
            case 'case':
            case 'default':
                $this->expect(['switch'], $word, $line);
                $open = $this->afterSwitch ? '' : '<?php ';
                $this->afterSwitch = false;
                return $word === 'case' ? "{$open}case $arg: ?>" : "{$open}default: ?>";
            case 'endswitch':
                $this->expect(['switch'], $word, $line);
                array_pop($this->stack);
                return '<?php endswitch; ?>';
            case 'php':
                return "<?php $arg; ?>";
            case 'forelse':
                $id = ++$this->counter;
                $this->stack[] = ['forelse', $line, $id, false];
                return "<?php \$__castEmpty$id = true; foreach ($arg): \$__castEmpty$id = false; ?>";
            case 'elseif':
            case 'else':
                $this->expect(['if', 'unless', 'isset'], $word, $line);
                return $word === 'else' ? '<?php else: ?>' : "<?php elseif ($arg): ?>";
            case 'empty':
                $top = $this->expect(['forelse'], $word, $line);
                if ($top[3]) $this->fail('@empty is used twice in one @forelse', $line);
                $this->stack[array_key_last($this->stack)][3] = true;
                return "<?php endforeach; if (\$__castEmpty{$top[2]}): ?>";
            case 'endif':
            case 'endfor':
            case 'endforeach':
            case 'endwhile':
            case 'endunless':
            case 'endisset':
                $kind = substr($word, 3);
                $this->expect($kind === 'unless' || $kind === 'isset' ? [$kind] : [$kind], $word, $line);
                array_pop($this->stack);
                return $kind === 'unless' || $kind === 'isset' ? '<?php endif; ?>' : "<?php $word; ?>";
            case 'endphp':
                $this->fail('@endphp has no matching @php', $line);
            case 'endforelse':
                $top = $this->expect(['forelse'], $word, $line);
                array_pop($this->stack);
                return $top[3] ? '<?php endif; ?>' : '<?php endforeach; ?>';       // no @empty block: just close the loop
            case 'map':
                $args = $this->splitArguments((string) $arg);
                if (count($args) < 2) {
                    $this->fail('@map expects at least 2 arguments: @map($collection, ($item, $i) => ...)', $line);
                }
                $collection = $args[0];
                $callback = $this->transformCallback($args[1], $this->lineOfOffset((string) $arg, $args[1], $line));
                return "<?= \\CastTemplateEngine\\Collection::map($collection, {$callback['code']}) ?>";
            case 'filter':
                $args = $this->splitArguments((string) $arg);
                if (count($args) < 2) {
                    $this->fail('@filter expects at least 2 arguments: @filter($collection, ($item) => condition)', $line);
                }
                $collection = $args[0];
                $predicate = $this->transformCallback($args[1], $this->lineOfOffset((string) $arg, $args[1], $line));

                if (count($args) >= 3) {
                    $render = $this->transformCallback($args[2], $this->lineOfOffset((string) $arg, $args[2], $line));
                    return "<?= \\CastTemplateEngine\\Collection::filter($collection, {$predicate['code']}, {$render['code']}) ?>";
                }

                // Standalone in-place filter
                return "<?php $collection = \\CastTemplateEngine\\Collection::filter($collection, {$predicate['code']}); ?>";
            case 'script':
            case 'js':
                $id = substr(md5((string) $arg), 0, 8);
                $escaped = var_export((string) $arg, true);
                return "<?php \\CastTemplateEngine\\Assets::addScript('$id', $escaped); ?>";
            case 'css':
                $compiled = \CastTemplateEngine\Css::compileBody((string) $arg, $this->file, $line);
                $id = $compiled['id'];
                $scoped = \CastTemplateEngine\Css::scope($compiled['css'], ".cast-$id", $this->classRenames);
                $escapedScoped = var_export($scoped, true);
                if (empty($compiled['holes'])) {
                    return "<?php \\CastTemplateEngine\\Assets::addStyle('$id', $escapedScoped); ?>";
                }
                $varAssignments = [];
                foreach ($compiled['holes'] as $k => $expr) {
                    $varAssignments[] = "'--cast-$id-$k: ' . ($expr)";
                }
                $varCode = implode(" . '; ' . ", $varAssignments);
                return "<?php \\CastTemplateEngine\\Assets::addStyle('$id', $escapedScoped); echo '<style>.cast-$id { ' . $varCode . '; }</style>'; ?>";
            case 'scripts':
                return "<?= \\CastTemplateEngine\\Assets::renderScripts() ?>";
            case 'styles':
                return "<?= \\CastTemplateEngine\\Assets::renderStyles() ?>";
            default:                                                                // break, continue
                $this->expectInside(['for', 'foreach', 'forelse', 'while', 'switch'], $word, $line);
                return $arg === null || $arg === '' ? "<?php $word; ?>" : "<?php if ($arg) $word; ?>";
        }
    }

    /** `<?= code ?>`; a newline right after it is kept (PHP swallows the one after `?>`) without adding a line. */
    private function echo(string $rawCode, int $line = 0): string
    {
        $code = trim($rawCode);
        if ($code === '') $this->fail('@{ } has nothing in it', $line);
        $code = $this->transformInlineRender($code, $rawCode, $line ?: $this->lineAt($this->pos));
        $newline = substr($this->src, $this->pos, 2) === "\r\n" ? 2 : (($this->src[$this->pos] ?? '') === "\n" ? 1 : 0);
        return $newline ? "<?= $code, \"\\n\" ?>" : "<?= $code ?>";
    }

    /**
     * Transforms return(...) or @render(...) inside an expression into an immediately-evaluated output buffer closure.
     * $rawCode/$line locate $code's real position (see lineOfOffset()): $code itself may already have been trimmed
     * by the caller, which would otherwise throw off a naive "line = $line + newlines before this point" count.
     */
    private function transformInlineRender(string $code, string $rawCode, int $line): string
    {
        $pattern = '/(?:return|@render)\s*\(/';
        while (preg_match($pattern, $code, $m, PREG_OFFSET_CAPTURE)) {
            $offset = $m[0][1];
            $openParen = $offset + strlen($m[0][0]) - 1;
            $len = strlen($code);
            $depth = 1;
            $closeParen = -1;
            $inQuote = false;
            $quoteChar = '';

            for ($i = $openParen + 1; $i < $len; $i++) {
                $c = $code[$i];
                if ($inQuote) {
                    if ($c === '\\') { $i++; continue; }
                    if ($c === $quoteChar) $inQuote = false;
                    continue;
                }
                if ($c === '"' || $c === "'") {
                    $inQuote = true;
                    $quoteChar = $c;
                    continue;
                }
                if ($c === '(') $depth++;
                elseif ($c === ')' && --$depth === 0) {
                    $closeParen = $i;
                    break;
                }
            }

            if ($closeParen === -1) break;

            $markup = substr($code, $openParen + 1, $closeParen - $openParen - 1);
            $markupLine = $this->lineOfOffset($rawCode, $markup, $line);
            $compiled = (new Directives($this->file, $this->classRenames, $markupLine - 1))->compile($markup);
            $replacement = '((function($__v) { extract($__v); ob_start(); ?>' . $compiled . '<?php return ob_get_clean(); })(get_defined_vars()))';

            $code = substr_replace($code, $replacement, (int) $offset, (int) ($closeParen - $offset + 1));
        }

        return $code;
    }

    /**
     * Splits top-level arguments by comma.
     * @return list<string>
     */
    private function splitArguments(string $code): array
    {
        $args = [];
        $current = '';
        $len = strlen($code);
        $depthParen = 0;
        $depthBrace = 0;
        $depthBracket = 0;
        $inQuote = false;
        $quoteChar = '';

        for ($i = 0; $i < $len; $i++) {
            $c = $code[$i];
            if ($inQuote) {
                if ($c === '\\') {
                    $current .= $c . ($code[++$i] ?? '');
                    continue;
                }
                if ($c === $quoteChar) $inQuote = false;
                $current .= $c;
                continue;
            }
            if ($c === '"' || $c === "'") {
                $inQuote = true;
                $quoteChar = $c;
                $current .= $c;
                continue;
            }
            if ($c === '(') $depthParen++;
            elseif ($c === ')') $depthParen--;
            elseif ($c === '{') $depthBrace++;
            elseif ($c === '}') $depthBrace--;
            elseif ($c === '[') $depthBracket++;
            elseif ($c === ']') $depthBracket--;
            elseif ($c === ',' && $depthParen === 0 && $depthBrace === 0 && $depthBracket === 0) {
                $args[] = trim($current);
                $current = '';
                continue;
            }
            $current .= $c;
        }
        if (trim($current) !== '') {
            $args[] = trim($current);
        }
        return $args;
    }

    /**
     * Transforms an arrow or native callback into executable PHP closure code.
     * $line: the real-file line where $cb (untrimmed) starts - see lineOfOffset() - so errors inside a nested
     * return(...)/markup body report their real line instead of counting from 1.
     * @return array{type: string, code: string}
     */
    private function transformCallback(string $cb, int $line = 0): array
    {
        $trimmedCb = trim($cb);
        if ($line === 0) $line = $this->lineAt($this->pos);

        if (preg_match('/^(?:(?:\(([^)]*)\)|(\$[A-Za-z0-9_]+)))\s*=>\s*(.*)$/s', $trimmedCb, $m)) {
            $rawParams = trim($m[1] !== '' ? $m[1] : $m[2]);
            $body = trim($m[3]);
            $cleanParams = $this->normalizeParams($rawParams);

            if (preg_match('/^return\s*\((.*)\)\s*;?$/s', $body, $bm)) {
                $markup = $bm[1];
                $markupLine = $this->lineOfOffset($cb, $markup, $line);
                $compiled = (new Directives($this->file, $this->classRenames, $markupLine - 1))->compile($markup);
                return [
                    'type' => 'render',
                    'code' => "function($cleanParams) { ob_start(); ?>" . $compiled . "<?php return ob_get_clean(); }"
                ];
            }
            if (preg_match('/^\((.*)\)\s*;?$/s', $body, $bm) && preg_match('/^\s*</', $bm[1])) {
                $markup = $bm[1];
                $markupLine = $this->lineOfOffset($cb, $markup, $line);
                $compiled = (new Directives($this->file, $this->classRenames, $markupLine - 1))->compile($markup);
                return [
                    'type' => 'render',
                    'code' => "function($cleanParams) { ob_start(); ?>" . $compiled . "<?php return ob_get_clean(); }"
                ];
            }
            if (str_starts_with($body, '<')) {
                $markupLine = $this->lineOfOffset($cb, $body, $line);
                $compiled = (new Directives($this->file, $this->classRenames, $markupLine - 1))->compile($body);
                return [
                    'type' => 'render',
                    'code' => "function($cleanParams) { ob_start(); ?>" . $compiled . "<?php return ob_get_clean(); }"
                ];
            }

            return [
                'type' => 'predicate',
                'code' => "fn($cleanParams) => ($body)"
            ];
        }

        return [
            'type' => 'native',
            'code' => $cb
        ];
    }

    private function normalizeParams(string $params): string
    {
        $parts = array_filter(array_map('trim', explode(',', $params)));
        if (empty($parts)) {
            return '$item = null, $i = 0, $key = null';
        }

        $normalized = [];
        foreach ($parts as $idx => $part) {
            $var = str_starts_with($part, '$') ? $part : '$' . $part;
            if ($idx === 1) {
                $normalized[] = "$var = 0";
            } elseif ($idx === 2) {
                $normalized[] = "$var = null";
            } else {
                $normalized[] = $var;
            }
        }
        if (count($normalized) === 1) {
            $normalized[] = '$i = 0';
            $normalized[] = '$key = null';
        } elseif (count($normalized) === 2) {
            $normalized[] = '$key = null';
        }
        return implode(', ', $normalized);
    }

    // ------------------------------------------------------------------ parsing

    private function parenthesised(string $word, int $line): string
    {
        preg_match('/\G\s*/', $this->src, $m, 0, $this->pos);
        $at = $this->pos + strlen($m[0]);
        if (($this->src[$at] ?? '') !== '(') $this->fail("@$word needs an expression in parentheses: @$word (...)", $line);
        $code = $this->balanced($at, '(', ')');
        $this->pos = $at + strlen($code) + 2;
        if (trim($code) === '') $this->fail("@$word () has nothing in it", $line);
        return trim($code);
    }

    private function optionalParenthesised(): ?string
    {
        preg_match('/\G[ \t]*/', $this->src, $m, 0, $this->pos);
        $at = $this->pos + strlen($m[0]);
        if (($this->src[$at] ?? '') !== '(') return null;
        $code = $this->balanced($at, '(', ')');
        $this->pos = $at + strlen($code) + 2;
        return trim($code);
    }

    private function optionalColon(): void
    {
        if (preg_match('/\G[ \t]*:(?!:)/', $this->src, $m, 0, $this->pos)) $this->pos += strlen($m[0]);
    }

    /** The text between the bracket at $open and its partner, skipping quoted strings. */
    private function balanced(int $open, string $in, string $out): string
    {
        $depth = 0;
        for ($i = $open; $i < $this->len; $i++) {
            $c = $this->src[$i];
            if ($c === '"' || $c === "'") {
                for ($i++; $i < $this->len && $this->src[$i] !== $c; $i++) if ($this->src[$i] === '\\') $i++;
                continue;
            }
            if ($c === $in) $depth++;
            elseif ($c === $out && --$depth === 0) return substr($this->src, $open + 1, $i - $open - 1);
        }
        $this->fail("a $in is never closed", $this->lineAt($open));
    }

    /** @param list<string> $kinds @return array{string, int, int, bool} */
    private function expect(array $kinds, string $word, int $line): array
    {
        $top = end($this->stack);
        if ($top === false || !in_array($top[0], $kinds, true)) {
            $this->fail("@$word has no matching @" . $kinds[0] . ($top === false ? '' : " (the open block is @{$top[0]}, from line {$top[1]})"), $line);
        }
        return $top;
    }

    /** @param list<string> $kinds */
    private function expectInside(array $kinds, string $word, int $line): void
    {
        foreach ($this->stack as $block) if (in_array($block[0], $kinds, true)) return;
        $this->fail("@$word is only allowed inside a loop or a @switch", $line);
    }

    private function fail(string $message, int $line = 0): never
    {
        $line = $line ?: $this->lineAt(min($this->pos, $this->len));
        throw new TemplateError("$message in {$this->file} on line $line", $this->file, $line);
    }
}
