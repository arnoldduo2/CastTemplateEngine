<?php

declare(strict_types=1);

namespace CastTemplateEngine\Build;

final class Bundler
{
    private const START_MARKER = '/* cast:components:start */';
    private const END_MARKER   = '/* cast:components:end */';

    /**
     * Minifies and bundles all component CSS and JS into app.css and app.js.
     *
     * @return array{css_count: int, js_count: int, app_css: string, app_js: string}
     */
    public static function build(string $root): array
    {
        $root = rtrim($root, '/\\');

        // 1. CSS Bundling
        $cssDirs = [
            $root . '/resources/css/components',
            $root . '/css/components',
        ];
        $cssFiles = [];
        foreach ($cssDirs as $dir) {
            if (is_dir($dir)) {
                foreach (glob($dir . '/*.css') ?: [] as $file) {
                    if (is_file($file)) $cssFiles[basename($file)] = $file;
                }
            }
        }

        $bundledCss = '';
        foreach ($cssFiles as $name => $file) {
            $raw = (string) file_get_contents($file);
            $bundledCss .= "/* {$name} */\n" . self::minifyCss($raw) . "\n";
        }

        $appCssPath = is_file($root . '/resources/css/app.css')
            ? $root . '/resources/css/app.css'
            : (is_file($root . '/css/app.css') ? $root . '/css/app.css' : $root . '/resources/css/app.css');

        self::writeBundleWithMarkers($appCssPath, trim($bundledCss));

        // 2. JS Bundling
        $jsDirs = [
            $root . '/resources/js/components',
            $root . '/js/components',
        ];
        $jsFiles = [];
        foreach ($jsDirs as $dir) {
            if (is_dir($dir)) {
                foreach (glob($dir . '/*.js') ?: [] as $file) {
                    if (is_file($file)) $jsFiles[basename($file)] = $file;
                }
            }
        }

        // Include runtime cast.js
        $runtime = (string) @file_get_contents(__DIR__ . '/../../assets/cast.js');
        $bundledJs = self::minifyJs($runtime) . "\n";

        foreach ($jsFiles as $name => $file) {
            $raw = (string) file_get_contents($file);
            $bundledJs .= "/* {$name} */\n(function(){\n" . self::minifyJs($raw) . "\n})();\n";
        }

        $appJsPath = is_file($root . '/resources/js/app.js')
            ? $root . '/resources/js/app.js'
            : (is_file($root . '/js/app.js') ? $root . '/js/app.js' : $root . '/resources/js/app.js');

        self::writeBundleWithMarkers($appJsPath, trim($bundledJs));

        return [
            'css_count' => count($cssFiles),
            'js_count' => count($jsFiles),
            'app_css' => $appCssPath,
            'app_js' => $appJsPath,
        ];
    }

    /**
     * Replaces or appends content between /* cast:components:start * / and /* cast:components:end * / markers.
     */
    public static function writeBundleWithMarkers(string $filePath, string $content): void
    {
        $dir = dirname($filePath);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $current = is_file($filePath) ? (string) file_get_contents($filePath) : '';
        $block = self::START_MARKER . "\n" . $content . "\n" . self::END_MARKER;

        if (str_contains($current, self::START_MARKER) && str_contains($current, self::END_MARKER)) {
            $pattern = '~' . preg_quote(self::START_MARKER, '~') . '.*?' . preg_quote(self::END_MARKER, '~') . '~s';
            $updated = (string) preg_replace($pattern, $block, $current);
        } else {
            $updated = trim($current) !== '' ? trim($current) . "\n\n" . $block . "\n" : $block . "\n";
        }

        file_put_contents($filePath, $updated);
    }

    /**
     * Fast, dependency-free CSS minifier.
     */
    public static function minifyCss(string $css): string
    {
        // Strip comments
        $css = (string) preg_replace('~/\*.*?\*/~s', '', $css);
        // Normalize whitespace
        $css = (string) preg_replace('/\s+/', ' ', $css);
        // Remove spaces around symbols
        $css = (string) preg_replace('/\s*([;{}:,>~+])\s*/', '$1', $css);
        // Remove trailing semicolons in blocks
        $css = (string) preg_replace('/;}/', '}', $css);
        return trim($css);
    }

    /**
     * Fast, dependency-free JS minifier.
     */
    public static function minifyJs(string $js): string
    {
        // Strip multiline comments
        $js = (string) preg_replace('~/\*.*?\*/~s', '', $js);
        // Strip single line comments (when not in strings)
        $lines = explode("\n", $js);
        $cleanLines = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if (str_starts_with($line, '//')) continue;
            if ($line !== '') {
                $cleanLines[] = $line;
            }
        }
        return implode("\n", $cleanLines);
    }
}
