<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Commands;

use CastTemplateEngine\Compiler;
use CastTemplateEngine\Console\CommandInterface;

final class EngineCheckCommand implements CommandInterface
{
    public function getName(): string
    {
        return 'engine:check';
    }

    public function getDescription(): string
    {
        return 'Lint and validate all .cast.php files in the project for errors and missing keys';
    }

    public function execute(array $args): int
    {
        $json = in_array('--json', $args, true);
        $args = array_values(array_filter($args, fn ($a) => $a !== '--json'));

        $target = $args[0] ?? getcwd();
        $targetDir = is_file($target) ? dirname($target) : $target;
        $componentsDir = $this->resolveComponentsDir($targetDir);

        $files = $this->findFiles($target);
        if (empty($files)) {
            if ($json) {
                echo json_encode([
                    'filesChecked' => 0,
                    'errors' => 0,
                    'warnings' => 0,
                    'problems' => [],
                    'message' => "No .cast.php files found in {$target}."
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
            } else {
                echo "No .cast.php files found in {$target}.\n";
            }
            return 0;
        }

        if (!$json) {
            echo "\n[Cast Engine] Scanning for .cast.php template files in {$target}...\n\n";
        }

        $totalErrors = 0;
        $totalWarnings = 0;
        $allProblems = [];

        foreach ($files as $file) {
            $source = (string) @file_get_contents($file);
            $problems = Compiler::lint($source, $file, $componentsDir);

            if (!empty($problems)) {
                foreach ($problems as $problem) {
                    $allProblems[] = $problem;
                    if ($problem['type'] === 'error') {
                        $totalErrors++;
                    } else {
                        $totalWarnings++;
                    }
                }
            }

            if (!$json) {
                if (empty($problems)) {
                    echo "  \033[32m✔\033[0m {$file}\n";
                } else {
                    echo "  \033[31m✖\033[0m {$file}\n";
                    foreach ($problems as $problem) {
                        $badge = $problem['type'] === 'error' ? "\033[31mERROR\033[0m" : "\033[33mWARN\033[0m ";
                        echo "     [line {$problem['line']}] {$badge} {$problem['message']}\n";
                    }
                }
            }
        }

        if ($json) {
            echo json_encode([
                'filesChecked' => count($files),
                'errors' => $totalErrors,
                'warnings' => $totalWarnings,
                'problems' => $allProblems
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
        } else {
            echo "\n[Cast Engine] Checked " . count($files) . " file(s): {$totalErrors} error(s), {$totalWarnings} warning(s).\n";
        }

        return $totalErrors > 0 ? 1 : 0;
    }

    /**
     * Finds the project's component root so <Tag /> references can be resolved while linting,
     * following the same `{views}/components` convention as `engine:compile`.
     */
    private function resolveComponentsDir(string $targetDir): string
    {
        $candidates = [
            $targetDir . '/components',
            $targetDir . '/resources/views/components',
            $targetDir . '/views/components',
        ];

        foreach ($candidates as $candidate) {
            if (is_dir($candidate)) {
                return $candidate;
            }
        }

        return $targetDir;
    }

    /**
     * @return list<string>
     */
    private function findFiles(string $dir): array
    {
        $out = [];
        if (!is_dir($dir)) {
            return is_file($dir) && str_ends_with($dir, '.cast.php') ? [$dir] : [];
        }

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS | \FilesystemIterator::FOLLOW_SYMLINKS)
        );

        foreach ($iterator as $item) {
            if ($item->isFile() && str_ends_with($item->getFilename(), '.cast.php')) {
                // Skip vendor and cache directories
                $path = $item->getPathname();
                if (str_contains($path, DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR)
                    || str_contains($path, DIRECTORY_SEPARATOR . 'cache' . DIRECTORY_SEPARATOR)
                    || str_contains($path, DIRECTORY_SEPARATOR . '.git' . DIRECTORY_SEPARATOR)) {
                    continue;
                }
                $out[] = $path;
            }
        }

        return $out;
    }
}
