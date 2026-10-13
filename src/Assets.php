<?php

declare(strict_types=1);

namespace CastTemplateEngine;

/**
 * Manages collected styles (@css) and scripts (@script, @js) across components in a render cycle.
 */
final class Assets
{
    /** @var array<string, string> id => scoped CSS rules */
    private static array $styles = [];

    /** @var array<string, string> id => wrapped JS code */
    private static array $scripts = [];

    /** @var array<string, bool> */
    private static array $componentCssFiles = [];

    /** @var array<string, bool> */
    private static array $componentJsFiles = [];

    public static function addStyle(string $id, string $css): void
    {
        if (!isset(self::$styles[$id])) {
            self::$styles[$id] = $css;
        }
    }

    public static function addScript(string $id, string $js): void
    {
        if (!isset(self::$scripts[$id])) {
            self::$scripts[$id] = $js;
        }
    }

    public static function addComponentCssFile(string $file): void
    {
        self::$componentCssFiles[$file] = true;
    }

    public static function addComponentJsFile(string $file): void
    {
        self::$componentJsFiles[$file] = true;
    }

    /**
     * @return array<string, string>
     */
    public static function getStyles(): array
    {
        return self::$styles;
    }

    /**
     * @return array<string, string>
     */
    public static function getScripts(): array
    {
        return self::$scripts;
    }

    /**
     * Returns HTML for all collected styles.
     */
    public static function renderStyles(): string
    {
        $out = '';
        foreach (array_keys(self::$componentCssFiles) as $file) {
            if (is_file($file)) {
                $content = trim((string) @file_get_contents($file));
                if ($content !== '') {
                    $out .= "/* " . basename($file) . " */\n" . $content . "\n";
                }
            }
        }

        foreach (self::$styles as $id => $css) {
            $out .= "/* {$id} */\n" . trim($css) . "\n";
        }

        return $out !== '' ? "<style>\n" . trim($out) . "\n</style>" : '';
    }

    /**
     * Returns HTML for all collected scripts, injecting cast.js runtime if needed.
     */
    public static function renderScripts(string $mode = 'inline', ?string $cacheDir = null): string
    {
        $runtime = (string) @file_get_contents(__DIR__ . '/../assets/cast.js');
        $code = trim($runtime) . "\n";

        foreach (array_keys(self::$componentJsFiles) as $file) {
            if (is_file($file)) {
                $js = trim((string) @file_get_contents($file));
                if ($js !== '') {
                    $code .= "(function () {\n" . $js . "\n})();\n";
                }
            }
        }

        foreach (self::$scripts as $id => $script) {
            $code .= "(function () {\n" . trim($script) . "\n})();\n";
        }

        if (trim($code) === '') {
            return '';
        }

        if ($mode === 'module' && $cacheDir !== null) {
            $hash = substr(md5($code), 0, 12);
            $jsDir = rtrim($cacheDir, '/\\') . '/js';
            if (!is_dir($jsDir)) {
                @mkdir($jsDir, 0775, true);
            }
            $target = "{$jsDir}/cast-{$hash}.js";
            if (!is_file($target)) {
                file_put_contents($target, $code);
            }
            return '<script defer src="/cache/js/cast-' . $hash . '.js"></script>';
        }

        return "<script>\n" . trim($code) . "\n</script>";
    }

    /**
     * Resets collected assets for the current request.
     */
    public static function reset(): void
    {
        self::$styles = [];
        self::$scripts = [];
        self::$componentCssFiles = [];
        self::$componentJsFiles = [];
    }
}
