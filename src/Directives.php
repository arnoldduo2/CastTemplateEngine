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
 *   @@                                      a literal @
 *
 * The colon after the closing parenthesis is optional. Anything PHP accepts in the parentheses works, including nested
 * parentheses, brackets and strings. Left alone: <?php ?> and <?= ?>, everything inside <style> except @{ }, an @ right after
 * a letter, digit, dot or underscore (e-mail addresses), and words that are not directives (@media, @import ...).
 * Line numbers are kept: a directive never adds or removes a line, so errors still point at the template line.
 */
final class Directives
{
    private const OPEN = ['for', 'foreach', 'forelse', 'while', 'if'];
    private const WORD = '(forelse|foreach|elseif|endforelse|endforeach|endswitch|endunless|endisset|endwhile|endphp|endfor|endif|switch|unless|isset|default|empty|else|case|for|while|if|php|break|continue)';

    private string $src = '';
    private int $len = 0;
    private int $pos = 0;
    private int $counter = 0;
    /** where the last directive ended, so @endif@endforeach is two directives and not an e-mail address */
    private int $lastEnd = -1;
    private bool $afterSwitch = false;
    /** @var list<array{string, int, int, bool}> open blocks: [directive, line, id, seen @empty] */
    private array $stack = [];

    public function __construct(private string $file = 'template') {}

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
            return $this->echo(trim($code));
        }

        $before = $p > 0 ? $this->src[$p - 1] : '';
        if ($p !== $this->lastEnd && $before !== '' && (ctype_alnum($before) || $before === '.' || $before === '_')) {
            $this->pos++;
            return '@';                                  // an e-mail address, not ours
        }

        if (!$directives || !preg_match('/\G@' . self::WORD . '\b/', $this->src, $m, 0, $p)) {
            $this->pos++;
            return '@';                                  // @media, @import, a lone @
        }
        $word = $m[1];
        $line = substr_count($this->src, "\n", 0, $p) + 1;
        $this->pos = $p + strlen($m[0]);

        $arg = null;
        if ($word === 'php' && !preg_match('/\G[ \t]*\(/', $this->src, $_, 0, $this->pos)) return $this->phpBlock($line);
        if (in_array($word, ['for', 'foreach', 'forelse', 'while', 'if', 'elseif', 'unless', 'isset', 'switch', 'case', 'php'], true)) {
            $arg = $this->parenthesised($word, $line);
        } elseif (in_array($word, ['break', 'continue'], true)) {
            $arg = $this->optionalParenthesised();
        }
        $this->optionalColon();

        $code = $this->emit($word, $arg, $line);
        $this->lastEnd = $this->pos;
        return $code;
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
            default:                                                                // break, continue
                $this->expectInside(['for', 'foreach', 'forelse', 'while', 'switch'], $word, $line);
                return $arg === null || $arg === '' ? "<?php $word; ?>" : "<?php if ($arg) $word; ?>";
        }
    }

    /** `<?= code ?>`; a newline right after it is kept (PHP swallows the one after `?>`) without adding a line. */
    private function echo(string $code): string
    {
        if ($code === '') $this->fail('@{ } has nothing in it');
        $newline = substr($this->src, $this->pos, 2) === "\r\n" ? 2 : (($this->src[$this->pos] ?? '') === "\n" ? 1 : 0);
        return $newline ? "<?= $code, \"\\n\" ?>" : "<?= $code ?>";
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
        $this->fail("a $in is never closed", substr_count($this->src, "\n", 0, $open) + 1);
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
        $line = $line ?: substr_count($this->src, "\n", 0, min($this->pos, $this->len)) + 1;
        throw new TemplateError("$message in {$this->file} on line $line");
    }
}
