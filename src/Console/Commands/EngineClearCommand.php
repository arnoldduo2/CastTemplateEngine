<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Commands;

use CastTemplateEngine\Console\CommandInterface;

final class EngineClearCommand implements CommandInterface
{
    public function getName(): string
    {
        return 'engine:clear';
    }

    public function getDescription(): string
    {
        return 'Clear all compiled template cache files';
    }

    public function execute(array $args): int
    {
        $root = $args[0] ?? getcwd();
        $candidates = [
            $root . '/storage/cache/views',
            $root . '/storage/cache',
            sys_get_temp_dir(),
        ];

        $cleared = 0;
        foreach ($candidates as $dir) {
            if (!is_dir($dir)) continue;
            foreach (glob($dir . '/*.php') ?: [] as $file) {
                if (is_file($file)) {
                    @unlink($file);
                    $cleared++;
                }
            }
        }

        echo "\n[Cast Engine] Cleared {$cleared} compiled template file(s) from cache.\n";
        return 0;
    }
}
