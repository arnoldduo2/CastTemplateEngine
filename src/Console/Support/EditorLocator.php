<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Support;

/**
 * Resolves editor extension-folder targets under the user's home directory.
 * Shared by EngineEditorCommand (single `--editor=` selection) and
 * EngineEditorInstallCommand (zero or more `--<editor>` boolean flags).
 */
final class EditorLocator
{
    /** @var array<string, list<string>> */
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

    /** @var array<string, list<string>> display name => folder candidates, used only for auto-detect */
    private const AUTO_DETECT_CANDIDATES = [
        'Antigravity IDE'  => ['.antigravity-ide/extensions', '.antigravity/extensions'],
        'VS Code'          => ['.vscode/extensions'],
        'VS Code Insiders' => ['.vscode-insiders/extensions'],
        'Cursor'           => ['.cursor/extensions'],
        'Windsurf'         => ['.windsurf/extensions'],
        'VSCodium'         => ['.vscode-oss/extensions'],
    ];

    /**
     * @return list<string> every known editor key/alias (for validating `--<editor>` flags)
     */
    public static function knownKeys(): array
    {
        return array_keys(self::EDITORS);
    }

    /**
     * @param list<string> $requestedEditors Zero or more editor keys/aliases. Empty = auto-detect all
     *     installed editors (or fall back to VS Code if none are found).
     * @return array<string, string> editorName => targetDirectory
     */
    public static function resolve(string $home, string $extensionId, array $requestedEditors = []): array
    {
        if (empty($requestedEditors)) {
            return self::autoDetect($home, $extensionId);
        }

        $targets = [];
        foreach ($requestedEditors as $requestedEditor) {
            $requestedEditor = strtolower(trim($requestedEditor));
            if ($requestedEditor === '' || $requestedEditor === 'all') {
                continue;
            }

            $folders = self::EDITORS[$requestedEditor] ?? [".{$requestedEditor}/extensions"];
            $folder = $folders[0];
            $dir = $home . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);
            $targets[$requestedEditor] = $dir . DIRECTORY_SEPARATOR . $extensionId;
        }

        return $targets;
    }

    /**
     * @return array<string, string>
     */
    private static function autoDetect(string $home, string $extensionId): array
    {
        $detected = [];

        foreach (self::AUTO_DETECT_CANDIDATES as $name => $folders) {
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
}
