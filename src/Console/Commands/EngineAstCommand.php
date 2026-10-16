<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Commands;

use CastTemplateEngine\Compiler;
use CastTemplateEngine\Console\CommandInterface;
use CastTemplateEngine\Css;
use CastTemplateEngine\Props;

final class EngineAstCommand implements CommandInterface
{
    public function getName(): string
    {
        return 'engine:ast';
    }

    public function getDescription(): string
    {
        return 'Inspect the syntactic structure and metadata (AST, props, components, styles) of a .cast.php template';
    }

    public function execute(array $args): int
    {
        $file = $args[0] ?? null;

        if ($file === null || !is_file($file)) {
            echo json_encode([
                'error' => 'Please provide a valid .cast.php file path.',
                'usage' => 'php cast engine:ast <path/to/view.cast.php>'
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
            return 1;
        }

        $source = (string) file_get_contents($file);
        $ast = self::analyze($source, $file);

        echo json_encode($ast, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
        return 0;
    }

    /**
     * @return array<string, mixed>
     */
    public static function analyze(string $source, string $file = 'template'): array
    {
        $props = Props::scan($source, $file);
        $classRenames = Css::scanClassRenames($source);

        // Find echo holes @{ ... }
        $echoHoles = [];
        $len = strlen($source);
        $pos = 0;
        while ($pos < $len) {
            $at = strpos($source, '@{', $pos);
            if ($at === false) break;

            // skip inside PHP tags
            $phpOpen = strpos($source, '<?', $pos);
            if ($phpOpen !== false && $phpOpen < $at) {
                $phpClose = strpos($source, '?' . '>', $phpOpen + 2);
                $pos = $phpClose === false ? $len : $phpClose + 2;
                continue;
            }

            // Balanced brace search
            $depth = 0;
            $end = -1;
            for ($i = $at + 1; $i < $len; $i++) {
                $c = $source[$i];
                if ($c === '{') $depth++;
                elseif ($c === '}') {
                    $depth--;
                    if ($depth === 0) {
                        $end = $i + 1;
                        break;
                    }
                }
            }

            if ($end === -1) break;

            $expr = trim(substr($source, $at + 2, $end - $at - 3));
            $line = substr_count($source, "\n", 0, $at) + 1;
            $echoHoles[] = [
                'line' => $line,
                'start' => $at,
                'end' => $end,
                'expression' => $expr
            ];
            $pos = $end;
        }

        // Find component tags
        $componentTags = [];
        $pattern = '/<(\/?)([A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)*)([\s\S]*?)(\/?)>/';
        if (preg_match_all($pattern, $source, $matches, PREG_OFFSET_CAPTURE)) {
            $count = count($matches[0]);
            for ($i = 0; $i < $count; $i++) {
                $raw = $matches[0][$i][0];
                $offset = (int) $matches[0][$i][1];
                $isClosing = $matches[1][$i][0] === '/';
                $tagName = $matches[2][$i][0];
                $attrString = $matches[3][$i][0];
                $isSelfClosing = $matches[4][$i][0] === '/';
                $line = substr_count($source, "\n", 0, $offset) + 1;

                $componentTags[] = [
                    'tag' => $tagName,
                    'line' => $line,
                    'isClosing' => $isClosing,
                    'isSelfClosing' => $isSelfClosing,
                    'rawAttributes' => trim($attrString)
                ];
            }
        }

        return [
            'file' => $file,
            'props' => $props,
            'echoHoles' => $echoHoles,
            'componentTags' => $componentTags,
            'scopedClasses' => $classRenames
        ];
    }
}
