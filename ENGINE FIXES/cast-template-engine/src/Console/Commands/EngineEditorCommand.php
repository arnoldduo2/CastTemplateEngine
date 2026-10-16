<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Commands;

use CastTemplateEngine\Console\CommandInterface;

final class EngineEditorCommand implements CommandInterface
{
    private const EDITORS = [
        'antigravity-ide' => ['.antigravity-ide/extensions', '.antigravity/extensions'],
        'antigravity'     => ['.antigravity-ide/extensions', '.antigravity/extensions'],
        'agy'             => ['.antigravity-ide/extensions', '.antigravity/extensions'],
        'code'            => ['.vscode/extensions'],
        'vscode'          => ['.vscode/extensions'],
        'insiders'        => ['.vscode-insiders/extensions'],
        'vscodium'        => ['.vscode-oss/extensions'],
        'codium'          => ['.vscode-oss/extensions'],
        'cursor'          => ['.cursor/extensions'],
        'windsurf'        => ['.windsurf/extensions'],
    ];

    public function getName(): string
    {
        return 'engine:editor';
    }

    public function getDescription(): string
    {
        return 'Install or update the CastFramework editor extension (VS Code, Antigravity IDE, Cursor, Windsurf, etc.)';
    }

    public function execute(array $args): int
    {
        $action = 'install';
        $requestedEditor = null;

        foreach ($args as $arg) {
            if ($arg === 'install' || $arg === 'update' || $arg === 'uninstall') {
                $action = $arg;
            } elseif (str_starts_with($arg, '--editor=')) {
                $requestedEditor = strtolower(trim(substr($arg, 9)));
            } elseif ($arg === '--editor') {
                $requestedEditor = 'all';
            }
        }

        $editorDir = realpath(__DIR__ . '/../../../editor/vscode');

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

        $home = getenv('CAST_HOME') ?: getenv('USERPROFILE') ?: getenv('HOME') ?: '';
        if ($home === '') {
            echo "[Cast Engine] Could not determine user home directory.\n";
            return 1;
        }

        $targets = $this->resolveTargets($home, $extensionId, $requestedEditor);
        if (empty($targets)) {
            echo "[Cast Engine] No supported editor extensions directory found.\n";
            return 1;
        }

        if ($action === 'uninstall') {
            foreach ($targets as $editorName => $targetDir) {
                if (!is_dir($targetDir)) {
                    echo "  \033[33m-\033[0m Not installed for {$editorName}, skipping.\n";
                    continue;
                }
                echo "[Cast Engine] Removing from {$editorName} ({$targetDir})...\n";
                $this->removeDirectory($targetDir);
                echo "  \033[32m✔\033[0m Uninstalled successfully from {$editorName}.\n";
            }

            echo "\n========================================================================\n";
            echo "  \033[32mSUCCESS:\033[0m Cast Editor Extension v{$version} has been uninstalled!\n";
            echo "========================================================================\n";
            echo "  Please reload or restart your editor window to complete removal.\n\n";

            return 0;
        }

        foreach ($targets as $editorName => $targetDir) {
            echo "[Cast Engine] Installing to {$editorName} ({$targetDir})...\n";
            $this->copyDirectory($editorDir, $targetDir);
            echo "  \033[32m✔\033[0m Installed successfully to {$editorName}.\n";
        }

        echo "\n========================================================================\n";
        echo "  \033[32mSUCCESS:\033[0m Cast Editor Extension v{$version} has been " . ($action === 'update' ? 'updated' : 'installed') . "!\n";
        echo "========================================================================\n";
        echo "  Please reload or restart your editor window to activate:\n";
        echo "  Press \033[36mCtrl+Shift+P\033[0m (or \033[36mCmd+Shift+P\033[0m on Mac), type \033[33mDeveloper: Reload Window\033[0m, and hit Enter.\n\n";

        return 0;
    }

    /**
     * @return array<string, string> editorName => targetDirectory
     */
    private function resolveTargets(string $home, string $extensionId, ?string $requestedEditor): array
    {
        $targets = [];

        if ($requestedEditor !== null && $requestedEditor !== 'all') {
            $folders = self::EDITORS[$requestedEditor] ?? [".{$requestedEditor}/extensions"];
            foreach ($folders as $folder) {
                $dir = $home . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);
                $targets[$requestedEditor] = $dir . DIRECTORY_SEPARATOR . $extensionId;
                break;
            }
            return $targets;
        }

        // Auto-detect all installed editors or install to all found
        $detected = [];
        $candidates = [
            'Antigravity IDE' => ['.antigravity-ide/extensions', '.antigravity/extensions'],
            'VS Code'         => ['.vscode/extensions'],
            'VS Code Insiders'=> ['.vscode-insiders/extensions'],
            'Cursor'          => ['.cursor/extensions'],
            'Windsurf'        => ['.windsurf/extensions'],
            'VSCodium'        => ['.vscode-oss/extensions'],
        ];

        foreach ($candidates as $name => $folders) {
            foreach ($folders as $folder) {
                $parent = $home . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);
                if (is_dir($parent)) {
                    $detected[$name] = $parent . DIRECTORY_SEPARATOR . $extensionId;
                    break;
                }
            }
        }

        // If none found, fallback to VS Code default
        if (empty($detected)) {
            $detected['VS Code'] = $home . DIRECTORY_SEPARATOR . '.vscode' . DIRECTORY_SEPARATOR . 'extensions' . DIRECTORY_SEPARATOR . $extensionId;
        }

        return $detected;
    }

    private function removeDirectory(string $dir): void
    {
        $handle = opendir($dir);
        if (!$handle) return;

        while (false !== ($file = readdir($handle))) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $file;
            if (is_dir($path)) {
                $this->removeDirectory($path);
            } else {
                @unlink($path);
            }
        }

        closedir($handle);
        @rmdir($dir);
    }

    private function copyDirectory(string $src, string $dst): void
    {
        if (!is_dir($dst)) {
            @mkdir($dst, 0777, true);
        }

        $dir = opendir($src);
        if (!$dir) return;

        while (false !== ($file = readdir($dir))) {
            if ($file === '.' || $file === '..' || $file === '.git' || $file === 'node_modules' || $file === 'test') {
                continue;
            }
            $srcPath = $src . DIRECTORY_SEPARATOR . $file;
            $dstPath = $dst . DIRECTORY_SEPARATOR . $file;

            if (is_dir($srcPath)) {
                $this->copyDirectory($srcPath, $dstPath);
            } else {
                @copy($srcPath, $dstPath);
            }
        }

        closedir($dir);
    }
}
