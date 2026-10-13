<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Commands;

use CastTemplateEngine\Console\CommandInterface;

final class EngineEditorCommand implements CommandInterface
{
    public function getName(): string
    {
        return 'engine:editor';
    }

    public function getDescription(): string
    {
        return 'Install or update the CastFramework / CastTemplateEngine VS Code extension';
    }

    public function execute(array $args): int
    {
        $action = strtolower($args[0] ?? 'install');
        $editorDir = __DIR__ . '/../../../../editor/vscode';
        if (!is_dir($editorDir)) {
            $editorDir = __DIR__ . '/../../../editor/vscode';
        }
        $editorDir = realpath($editorDir);

        if (!$editorDir || !is_file($editorDir . '/package.json')) {
            echo "[Cast Engine] Could not locate editor/vscode package.\n";
            return 1;
        }

        $packageJson = json_decode((string) file_get_contents($editorDir . '/package.json'), true);
        $version = $packageJson['version'] ?? '1.0.0';
        $publisher = $packageJson['publisher'] ?? 'anode';
        $name = $packageJson['name'] ?? 'cast-framework';
        $extensionId = "{$publisher}.{$name}-{$version}";

        echo "\n[Cast Engine] Editor extension: {$name} v{$version}\n";

        // Determine VS Code extension directory
        $home = getenv('USERPROFILE') ?: getenv('HOME');
        $vscodeExtDir = $home . '/.vscode/extensions/' . $extensionId;

        echo "[Cast Engine] Installing to {$vscodeExtDir}...\n";

        // Copy extension directory into VS Code extensions folder
        $this->copyDirectory($editorDir, $vscodeExtDir);

        echo "  \033[32m✔\033[0m Extension files installed successfully.\n";

        // Check if `code` CLI is available
        $hasCode = false;
        $checkCmd = PHP_OS_FAMILY === 'Windows' ? 'where code 2>nul' : 'which code 2>/dev/null';
        @exec($checkCmd, $output, $status);
        if ($status === 0 && !empty($output)) {
            $hasCode = true;
        }

        echo "\n========================================================================\n";
        echo "  \033[32mSUCCESS:\033[0m Cast VS Code Extension v{$version} has been " . ($action === 'update' ? 'updated' : 'installed') . "!\n";
        echo "========================================================================\n";
        echo "  Please reload or restart your VS Code window to activate:\n";
        echo "  Press \033[36mCtrl+Shift+P\033[0m (or \033[36mCmd+Shift+P\033[0m on Mac), type \033[33mDeveloper: Reload Window\033[0m, and hit Enter.\n\n";

        return 0;
    }

    private function copyDirectory(string $src, string $dst): void
    {
        if (!is_dir($dst)) {
            @mkdir($dst, 0777, true);
        }

        $dir = opendir($src);
        if (!$dir) return;

        while (false !== ($file = readdir($dir))) {
            if ($file === '.' || $file === '..' || $file === '.git' || $file === 'node_modules') {
                continue;
            }
            $srcPath = $src . '/' . $file;
            $dstPath = $dst . '/' . $file;

            if (is_dir($srcPath)) {
                $this->copyDirectory($srcPath, $dstPath);
            } else {
                @copy($srcPath, $dstPath);
            }
        }

        closedir($dir);
    }
}
