<?php

declare(strict_types=1);

namespace CastTemplateEngine;

/**
 * CastTemplate: React-style components on top of native PHP templates.
 *
 *   $cast = new CastTemplate('/app/views/components', '.cast.php', [
 *       'viewsDir' => '/app/views',
 *       'cacheDir' => '/app/storage/cache',
 *   ]);
 *   echo $cast->render('pages.invoice', ['invoice' => $invoice]);
 *
 * Every template (page or component) is compiled once by {@see Compiler},
 * cached, and included in its own scope. Component files receive their props
 * as variables (keys camelCased), plus `$props` and `$children`.
 */
final class CastTemplate
{
    public const VERSION = '1.0.1';

    private const OPTIONS = ['viewsDir', 'cacheDir', 'checkModified', 'shared'];

    private string $componentsDir;
    private string $ext;
    private ?string $viewsDir;
    private string $cacheDir;
    private bool $checkModified;
    /** @var array<string, mixed> variables available in every view and component */
    private array $shared;
    /** @var array<string, string> source file => compiled file (per request) */
    private array $compiled = [];
    /** @var list<array{path: string, props: array}> components waiting for their closing tag */
    private array $stack = [];
    /** @var list<string> open <Slot> names */
    private array $slots = [];
    /** @var array<string, string> */
    private static array $camel = [];

    /**
     * @param string $componentsDir Folder with the component files. A relative path is resolved against `viewsDir`.
     * @param string $ext           Extension of the files that may use the syntax, e.g. ".cast.php".
     * @param array{viewsDir?: string, cacheDir?: string, checkModified?: bool, shared?: array<string, mixed>} $options
     *   - viewsDir:      folder of the views passed to render() (required to call render()).
     *   - cacheDir:      where compiled files are written. Default: a folder in the system temp dir.
     *   - checkModified: recompile when the source file changed (default true; use false in production).
     *   - shared:        variables available in every view and component (explicit data wins).
     */
    public function __construct(string $componentsDir, string $ext = '.cast.php', array $options = [])
    {
        if ($unknown = array_diff(array_keys($options), self::OPTIONS)) {
            throw new TemplateError('Unknown CastTemplate option(s): ' . implode(', ', $unknown)
                . '. Allowed: ' . implode(', ', self::OPTIONS));
        }
        if (!preg_match('/^\.[A-Za-z0-9_.-]+$/', $ext)) {
            throw new TemplateError("Invalid extension \"$ext\": it must start with a dot, e.g. \".cast.php\"");
        }

        $this->ext = $ext;
        $this->viewsDir = isset($options['viewsDir']) ? rtrim($options['viewsDir'], '/\\') : null;
        $this->checkModified = (bool) ($options['checkModified'] ?? true);
        $this->shared = $options['shared'] ?? [];

        $componentsDir = rtrim($componentsDir, '/\\');
        $this->componentsDir = self::isAbsolute($componentsDir) || $this->viewsDir === null
            ? $componentsDir
            : $this->viewsDir . '/' . ltrim($componentsDir, '/\\');

        $this->cacheDir = isset($options['cacheDir'])
            ? rtrim($options['cacheDir'], '/\\')
            : sys_get_temp_dir() . '/cast-' . md5($this->componentsDir . '|' . ($this->viewsDir ?? ''));
    }

    /** Renders a view: 'pages/invoice' or 'pages.invoice'. */
    public function render(string $view, array $data = []): string
    {
        if ($this->viewsDir === null) {
            throw new TemplateError('Set the "viewsDir" option to use render()');
        }
        $file = $this->viewsDir . '/' . str_replace('.', '/', $view) . $this->ext;
        if (!is_file($file)) throw new TemplateError("View \"$view\" not found at $file");

        return $this->guard(fn() => $this->evaluate($this->compile($file), $data));
    }

    // ------------------------------------------------- called by compiled code

    /** `<Badge ... />` */
    public function component(string $path, array $props = []): string
    {
        $props = self::camelKeys($props);
        $props['children'] ??= '';
        $file = $this->componentsDir . '/' . $path . $this->ext;
        return $this->evaluate($this->compile($file), $props, true);
    }

    /** `<Card ...>` : start capturing children. */
    public function open(string $path, array $props = []): void
    {
        $this->stack[] = ['path' => $path, 'props' => $props];
        ob_start();
    }

    /** `</Card>` : render the component with what was captured since open(). */
    public function close(): string
    {
        $children = trim(ob_get_clean());
        $frame = array_pop($this->stack);
        if ($children !== '' || !isset($frame['props']['children'])) {
            $frame['props']['children'] = $children;
        }
        return $this->component($frame['path'], $frame['props']);
    }

    /** `<Slot name="left">` : start capturing a named prop. */
    public function slot(string $name): void
    {
        $this->slots[] = $name;
        ob_start();
    }

    /** `</Slot>` : give the captured HTML to the enclosing component. */
    public function endSlot(): void
    {
        $html = trim(ob_get_clean());
        $this->stack[array_key_last($this->stack)]['props'][array_pop($this->slots)] = $html;
    }

    /** `attr={value}` on an HTML tag: always escaped. */
    public function attr(string $name, mixed $value): string
    {
        if ($value === null || $value === false) return '';
        if ($value === true) return $name;
        if (is_array($value) || $value instanceof \JsonSerializable) {
            $value = json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        return $name . '="' . htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '"';
    }

    // ------------------------------------------------------------- internals

    /** `has_label`, `has-label`, `HasLabel` => `hasLabel` */
    public static function camel(string $key): string
    {
        return self::$camel[$key] ??= lcfirst(str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', $key))));
    }

    private static function camelKeys(array $props): array
    {
        $out = [];
        foreach ($props as $key => $value) {
            $out[is_string($key) ? self::camel($key) : $key] = $value;
        }
        return $out;
    }

    /** Returns the compiled copy of $file, compiling it when missing or stale. */
    private function compile(string $file): string
    {
        if (isset($this->compiled[$file])) return $this->compiled[$file];

        $target = $this->cacheDir . '/' . md5($file) . '.php';
        if (!is_file($target) || ($this->checkModified && filemtime($target) < filemtime($file))) {
            if (!is_dir($this->cacheDir) && !@mkdir($this->cacheDir, 0775, true) && !is_dir($this->cacheDir)) {
                throw new TemplateError("Cache directory \"{$this->cacheDir}\" is not writable");
            }
            $code = (new Compiler($this->componentsDir, $this->ext, $file))->compile((string) file_get_contents($file));
            $tmp = $target . '.' . bin2hex(random_bytes(4)) . '.tmp';
            // PHP wants declare(strict_types) to be the first statement: the line this engine adds comes first, so move it up there
            $declare = '';
            $code = (string) preg_replace_callback(
                '/\A(\s*<\?php\s+(?:(?:\/\*.*?\*\/|\/\/[^\n]*\n|#[^\n]*\n)\s*)*)declare\s*\(\s*strict_types\s*=\s*([01])\s*\)\s*;[ \t]*/s',
                function (array $m) use (&$declare): string {
                    $declare = "declare(strict_types={$m[2]}); ";
                    return $m[1];
                },
                $code,
                1,
            );
            file_put_contents($tmp, "<?php {$declare}/* $file */ ?>" . $code);
            rename($tmp, $target);
        }

        return $this->compiled[$file] = $target;
    }

    /**
     * Includes a compiled template in its own scope. Supports templates that
     * echo HTML and ones that `return` a string.
     */
    private function evaluate(string $__file, array $__vars, bool $__component = false): string
    {
        extract($__vars + $this->shared, EXTR_SKIP);
        if ($__component) $props = $__vars;
        unset($__vars, $__component);

        ob_start();
        $__returned = include $__file;
        $__output = ob_get_clean();

        return is_string($__returned) ? $__output . $__returned : $__output;
    }

    /** Cleans up open buffers and tag stacks if a template throws. */
    private function guard(callable $render): string
    {
        $level = ob_get_level();
        [$stack, $slots] = [count($this->stack), count($this->slots)];
        try {
            return $render();
        } catch (\Throwable $e) {
            while (ob_get_level() > $level) ob_end_clean();
            array_splice($this->stack, $stack);
            array_splice($this->slots, $slots);
            self::pointToSource($e);
            throw $e;
        }
    }

    /**
     * The template a compiled file came from, read from the first line the engine writes (`<?php /* source *\/ ?>`), or null
     * when $file is not a compiled template. Compiled files keep the line numbers of their source.
     */
    public static function sourceOf(string $file): ?string
    {
        static $known = [];
        if (array_key_exists($file, $known)) return $known[$file];
        $head = is_file($file) ? (string) @file_get_contents($file, false, null, 0, 2048) : '';
        return $known[$file] = preg_match('#^<\?php (?:declare\(strict_types=[01]\); )?/\* (.+?) \*/ \?>#', $head, $m) === 1 ? $m[1] : null;
    }

    /**
     * An error inside a template is reported in the compiled copy under the cache folder. Point it at the template instead, so the
     * error page and the logs show your view and its line, not `storage/framework/views/<hash>.php`: the exception's own file and
     * line, the paths in its message, and every frame of its trace. Idempotent (a template already seen is left alone).
     */
    public static function pointToSource(\Throwable $e): void
    {
        $base = $e instanceof \Error ? \Error::class : \Exception::class;
        $set = static function (string $property, mixed $value) use ($e, $base): void {
            $p = new \ReflectionProperty($base, $property);
            $p->setAccessible(true);
            $p->setValue($e, $value);
        };

        $trace = $e->getTrace();
        $changed = false;
        foreach ($trace as $i => $frame) {
            if (isset($frame['file']) && ($source = self::sourceOf($frame['file'])) !== null) {
                $trace[$i]['file'] = $source;
                $changed = true;
            }
        }

        $file = $e->getFile();
        $line = $e->getLine();
        if (($source = self::sourceOf($file)) !== null) {
            // thrown by the template itself (a warning turned into an exception, a compile error...)
            [$file, $changed] = [$source, true];
        } elseif (isset($trace[0]['file']) && self::sourceOf($e->getTrace()[0]['file'] ?? '') !== null) {
            // thrown by a function the template called directly (a helper that rejects its argument): the cause is the call in the template
            [$file, $line, $changed] = [$trace[0]['file'], (int) ($trace[0]['line'] ?? $line), true];
        }
        if (!$changed) return;

        $message = $e->getMessage();
        foreach (array_unique(array_filter(array_column($e->getTrace(), 'file'), fn($f) => self::sourceOf((string) $f) !== null)) as $compiled) {
            $message = str_replace($compiled, (string) self::sourceOf($compiled), $message);
        }
        $set('trace', $trace);
        $set('file', $file);
        $set('line', $line);
        $set('message', $message);
    }

    private static function isAbsolute(string $path): bool
    {
        return str_starts_with($path, '/') || str_starts_with($path, '\\') || preg_match('/^[A-Za-z]:[\/\\\\]/', $path) === 1;
    }
}
