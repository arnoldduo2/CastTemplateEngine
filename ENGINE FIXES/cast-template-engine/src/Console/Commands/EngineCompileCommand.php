<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Commands;

use CastTemplateEngine\CastTemplate;
use CastTemplateEngine\Console\CommandInterface;

final class EngineCompileCommand implements CommandInterface
{
    public function getName(): string
    {
        return 'engine:compile';
    }

    public function getDescription(): string
    {
        return 'Precompile all .cast.php template files into the cache folder';
    }

    public function execute(array $args): int
    {
        $root = $args[0] ?? getcwd();
        $componentsDir = $root . '/resources/views/components';
        $viewsDir = $root . '/resources/views';
        $cacheDir = $root . '/storage/cache/views';

        if (!is_dir($viewsDir)) {
            $viewsDir = $root . '/views';
            $componentsDir = $root . '/views/components';
        }

        echo "\n[Cast Engine] Precompiling templates in {$viewsDir}...\n";

        if (!is_dir($viewsDir)) {
            echo "Views directory not found at {$viewsDir}.\n";
            return 1;
        }

        $engine = new CastTemplate($componentsDir, '.cast.php', [
            'viewsDir' => $viewsDir,
            'cacheDir' => $cacheDir,
            'checkModified' => true,
        ]);

        $files = $this->findFiles($viewsDir);
        $count = 0;

        foreach ($files as $file) {
            try {
                $engine->renderFile($file);
                $count++;
                echo "  \033[32m✔\033[0m Compiled " . basename($file) . "\n";
            } catch (\Throwable $e) {
                echo "  \033[31m✖\033[0m Failed compiling {$file}: " . $e->getMessage() . "\n";
            }
        }

        echo "\n[Cast Engine] Finished. Compiled {$count} file(s) into {$cacheDir}.\n";
        return 0;
    }

    /**
     * @return list<string>
     */
    private function findFiles(string $dir): array
    {
        $out = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $item) {
            if ($item->isFile() && str_ends_with($item->getFilename(), '.cast.php')) {
                $out[] = $item->getPathname();
            }
        }
        return $out;
    }
}
