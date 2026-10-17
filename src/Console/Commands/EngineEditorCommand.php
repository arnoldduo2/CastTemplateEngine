<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Commands;

use CastTemplateEngine\Console\CommandInterface;
use CastTemplateEngine\Console\Support\EditorLocator;

final class EngineEditorCommand implements CommandInterface
{
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

        $meta = self::resolveExtensionMeta();
        if ($meta === null) {
            echo "[Cast Engine] Could not locate editor/vscode package.\n";
            return 1;
        }

        $editorDir = $meta['dir'];
        $version = $meta['version'];
        $extensionId = $meta['id'];

        echo "\n[Cast Engine] Editor extension: {$meta['name']} v{$version}\n";

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
                self::removeDirectory($targetDir);
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
            self::copyDirectory($editorDir, $targetDir);
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
     * Reads editor/vscode/package.json and derives the VS Code extension identity.
     * Shared with EngineEditorInstallCommand so both commands agree on the target dirs.
     *
     * @return array{dir: string, id: string, name: string, version: string}|null
     */
    public static function resolveExtensionMeta(): ?array
    {
        $editorDir = realpath(__DIR__ . '/../../../editor/vscode');
        if (!$editorDir || !is_file($editorDir . '/package.json')) {
            return null;
        }

        $packageJson = json_decode((string) file_get_contents($editorDir . '/package.json'), true);
        $version = $packageJson['version'] ?? '1.0.0';
        $publisher = $packageJson['publisher'] ?? 'anode';
        $name = $packageJson['name'] ?? 'cast-framework';

        return [
            'dir' => $editorDir,
            'id' => "{$publisher}.{$name}-{$version}",
            'name' => $name,
            'version' => $version,
        ];
    }

    /**
     * @return array<string, string> editorName => targetDirectory
     */
    private function resolveTargets(string $home, string $extensionId, ?string $requestedEditor): array
    {
        $requestedEditors = ($requestedEditor === null || $requestedEditor === 'all') ? [] : [$requestedEditor];

        return EditorLocator::resolve($home, $extensionId, $requestedEditors);
    }

    /** Shared with EngineEditorInstallCommand, which stages editor/language-core the same way. */
    public static function removeDirectory(string $dir): void
    {
        $handle = opendir($dir);
        if (!$handle) return;

        while (false !== ($file = readdir($handle))) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $file;
            if (is_dir($path)) {
                self::removeDirectory($path);
            } else {
                @unlink($path);
            }
        }

        closedir($handle);
        @rmdir($dir);
    }

    /** Shared with EngineEditorInstallCommand, which stages editor/language-core the same way. */
    public static function copyDirectory(string $src, string $dst): void
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
                self::copyDirectory($srcPath, $dstPath);
            } else {
                @copy($srcPath, $dstPath);
            }
        }

        closedir($dir);
    }
}
