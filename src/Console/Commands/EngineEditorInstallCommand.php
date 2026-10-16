<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Commands;

use CastTemplateEngine\Console\CommandInterface;
use CastTemplateEngine\Console\Support\EditorLocator;
use CastTemplateEngine\Console\Support\PhpactorInstaller;
use CastTemplateEngine\Console\Support\ProcessRunner;
use CastTemplateEngine\Console\Support\RequirementsChecker;

/**
 * Unified installer for the CastFramework VS Code extension AND the global
 * cast-language-server, with a requirements check (Node.js, npm, PHPactor).
 *
 * One class, three registrations — the action is baked into the command name
 * (engine:editor-install / engine:editor-update / engine:editor-uninstall)
 * rather than a positional argument.
 *
 * engine:editor (EngineEditorCommand) is unchanged and still works standalone.
 */
final class EngineEditorInstallCommand implements CommandInterface
{
    /** @param 'install'|'update'|'uninstall' $action */
    public function __construct(private readonly string $action)
    {
    }

    public function getName(): string
    {
        return "engine:editor-{$this->action}";
    }

    public function getDescription(): string
    {
        return match ($this->action) {
            'update' => 'Update the CastFramework extension and/or the global cast-language-server.',
            'uninstall' => 'Uninstall the CastFramework extension and/or the global cast-language-server.',
            default => 'Install the CastFramework extension and/or the global cast-language-server, with a requirements check.',
        };
    }

    public function execute(array $args): int
    {
        $opts = $this->parseArgs($args);
        $target = $opts['target'];
        $wantsExtension = $target === 'extension' || $target === 'all';
        $wantsServer = $target === 'lsp' || $target === 'all';

        $this->printBanner();

        $report = (new RequirementsChecker())->checkAll();
        $this->printReport($report);

        if ($opts['dryRun']) {
            $this->printPlan($target, $opts['editors'], $opts);
            return 0;
        }

        if ($this->action !== 'uninstall' && $wantsServer && !$opts['skipPhpactorPrompt']) {
            $this->maybeInstallPhpactor($opts['assumeYes']);
        }

        $results = [];
        $hadFailure = false;

        if ($wantsExtension) {
            ['results' => $extensionResults, 'failed' => $extensionFailed] = $this->installExtension($opts['editors']);
            $results = array_merge($results, $extensionResults);
            $hadFailure = $hadFailure || $extensionFailed;
        }

        if ($wantsServer) {
            $serverResult = $this->installServer($report);
            $results[] = $serverResult;
            if ($serverResult['status'] === 'fail') {
                $hadFailure = true;
            }
        }

        $this->printSummary($results);

        return $hadFailure ? 1 : 0;
    }

    /**
     * @param list<string> $args
     * @return array{target: string, editors: list<string>, assumeYes: bool, skipPhpactorPrompt: bool, dryRun: bool}
     */
    private function parseArgs(array $args): array
    {
        $target = 'all';
        $requestedEditors = [];
        $assumeYes = false;
        $skipPhpactorPrompt = false;
        $dryRun = false;
        $knownKeys = EditorLocator::knownKeys();

        foreach ($args as $arg) {
            $lower = strtolower($arg);

            if (in_array($lower, ['extension', 'lsp', 'all'], true)) {
                $target = $lower;
            } elseif ($lower === '--yes' || $lower === '-y') {
                $assumeYes = true;
            } elseif ($lower === '--no-phpactor') {
                $skipPhpactorPrompt = true;
            } elseif ($lower === '--dry-run') {
                $dryRun = true;
            } elseif (str_starts_with($arg, '--')) {
                $key = strtolower(substr($arg, 2));
                if (in_array($key, $knownKeys, true)) {
                    $requestedEditors[] = $key;
                } else {
                    echo "  \033[33m!\033[0m Unknown option --{$key} ignored.\n";
                }
            } else {
                echo "  \033[33m!\033[0m Unknown argument \"{$arg}\" ignored.\n";
            }
        }

        return [
            'target' => $target,
            'editors' => $requestedEditors,
            'assumeYes' => $assumeYes,
            'skipPhpactorPrompt' => $skipPhpactorPrompt,
            'dryRun' => $dryRun,
        ];
    }

    private function printBanner(): void
    {
        $label = match ($this->action) {
            'update' => 'Update',
            'uninstall' => 'Uninstall',
            default => 'Install',
        };

        echo "\n[Cast Engine] {$label}: editor extension + language server\n";
        echo str_repeat('=', 72) . "\n";
    }

    /**
     * @param list<array{id: string, label: string, status: string, detail: string, remediation: string}> $report
     */
    private function printReport(array $report): void
    {
        echo "\nRequirements:\n";
        foreach ($report as $item) {
            $icon = match ($item['status']) {
                'ok' => "\033[32m✔\033[0m",
                'warn' => "\033[33m!\033[0m",
                default => "\033[31m✘\033[0m",
            };
            echo "  {$icon} {$item['label']}: {$item['detail']}\n";
            if ($item['remediation'] !== '') {
                echo "      -> {$item['remediation']}\n";
            }
        }
        echo "\n";
    }

    private function maybeInstallPhpactor(bool $assumeYes): void
    {
        $installer = new PhpactorInstaller();
        if ($installer->isInstalled()) {
            return;
        }

        $installer->printInfo();

        if ($installer->promptConfirm($assumeYes)) {
            $installer->download();
        } else {
            echo "  Skipped. Run this command again later, or download phpactor.phar manually (see above).\n\n";
        }
    }

    /**
     * @param list<string> $editors
     * @return array{results: list<array{label: string, status: string, detail: string}>, failed: bool}
     */
    private function installExtension(array $editors): array
    {
        $results = [];
        $failed = false;
        $editorCalls = empty($editors) ? [null] : $editors;

        foreach ($editorCalls as $editorKey) {
            $label = $editorKey ?? 'auto-detected editor(s)';
            echo "\n[Cast Engine] {$this->actionVerb()}: CastFramework extension -> {$label}\n";

            $callArgs = [$this->action];
            if ($editorKey !== null) {
                $callArgs[] = "--editor={$editorKey}";
            }

            $exitCode = (new EngineEditorCommand())->execute($callArgs);
            if ($exitCode !== 0) {
                $failed = true;
                $results[] = ['label' => "Extension ({$label})", 'status' => 'fail', 'detail' => 'copy step failed'];
                continue;
            }

            if ($this->action !== 'uninstall') {
                $this->syncLanguageClientDeps($editorKey);
            }

            $results[] = ['label' => "Extension ({$label})", 'status' => 'ok', 'detail' => $this->actionVerbPast()];
        }

        return ['results' => $results, 'failed' => $failed];
    }

    /**
     * copyDirectory() in EngineEditorCommand skips node_modules, so the extension's
     * vscode-languageclient runtime dependency has to be installed separately, in place.
     */
    private function syncLanguageClientDeps(?string $editorKey): void
    {
        $meta = EngineEditorCommand::resolveExtensionMeta();
        $home = getenv('CAST_HOME') ?: getenv('USERPROFILE') ?: getenv('HOME') ?: '';
        if ($meta === null || $home === '') {
            return;
        }

        $targets = EditorLocator::resolve($home, $meta['id'], $editorKey === null ? [] : [$editorKey]);

        foreach ($targets as $name => $dir) {
            if (!is_dir($dir)) {
                continue;
            }

            echo "    Installing extension runtime dependencies for {$name}...\n";
            $hasLockfile = is_file($dir . DIRECTORY_SEPARATOR . 'package-lock.json');
            $npmArgs = $hasLockfile ? ['npm', 'ci', '--omit=dev'] : ['npm', 'install', '--omit=dev'];
            $result = ProcessRunner::run($npmArgs, $dir, false);

            if ($result->isSuccess()) {
                echo "    \033[32m✔\033[0m Language client dependencies ready for {$name}\n";
            } else {
                echo "    \033[33m!\033[0m Could not install language client dependencies for {$name} — the extension will still work, just without live LSP features.\n";
            }
        }
    }

    /**
     * @param list<array{id: string, label: string, status: string, detail: string, remediation: string}> $report
     * @return array{label: string, status: string, detail: string}
     */
    private function installServer(array $report): array
    {
        if ($this->action === 'uninstall') {
            echo "\n[Cast Engine] Uninstalling: cast-language-server (LSP)\n";
            ProcessRunner::run(['npm', 'uninstall', '-g', 'cast-language-server']);

            if (ProcessRunner::resolveOnPath('cast-language-server') === null) {
                echo "  \033[32m✔\033[0m cast-language-server uninstalled globally\n";
                return ['label' => 'cast-language-server (LSP)', 'status' => 'ok', 'detail' => 'uninstalled'];
            }

            echo "  \033[31m✘\033[0m cast-language-server is still resolvable on PATH after uninstall\n";
            return ['label' => 'cast-language-server (LSP)', 'status' => 'fail', 'detail' => 'uninstall did not remove the global binary'];
        }

        if ($this->statusFor($report, 'node') === 'fail' || $this->statusFor($report, 'npm') === 'fail') {
            echo "\n[Cast Engine] Skipping: cast-language-server (LSP) -> Node.js/npm not found\n";
            echo "  \033[33m!\033[0m Install Node.js 18+ from https://nodejs.org, then re-run this command.\n";
            return ['label' => 'cast-language-server (LSP)', 'status' => 'skip', 'detail' => 'Node.js/npm not found'];
        }

        $serverDir = RequirementsChecker::serverDir();
        echo "\n[Cast Engine] {$this->actionVerb()}: cast-language-server (LSP) -> global npm\n";

        echo "  Installing dependencies (npm install)...\n";
        if (!ProcessRunner::run(['npm', 'install'], $serverDir)->isSuccess()) {
            echo "  \033[31m✘\033[0m npm install failed\n";
            return ['label' => 'cast-language-server (LSP)', 'status' => 'fail', 'detail' => 'npm install failed'];
        }
        echo "  \033[32m✔\033[0m Dependencies installed\n";

        echo "  Building (npm run build)...\n";
        $build = ProcessRunner::run(['npm', 'run', 'build'], $serverDir);
        if (!$build->isSuccess() || !is_file(RequirementsChecker::serverEntryPath())) {
            echo "  \033[31m✘\033[0m Build failed\n";
            return ['label' => 'cast-language-server (LSP)', 'status' => 'fail', 'detail' => 'npm run build failed'];
        }
        echo "  \033[32m✔\033[0m Build succeeded (dist/server.js)\n";

        echo "  Installing globally (npm install -g)...\n";
        if (!ProcessRunner::run(['npm', 'install', '-g', $serverDir])->isSuccess()) {
            echo "  \033[31m✘\033[0m Global install failed\n";
            return ['label' => 'cast-language-server (LSP)', 'status' => 'fail', 'detail' => 'npm install -g failed'];
        }

        $resolved = ProcessRunner::resolveOnPath('cast-language-server');
        if ($resolved === null) {
            echo "  \033[33m!\033[0m Installed, but cast-language-server isn't resolvable on PATH yet.\n";
            echo "      Run `npm config get prefix` and make sure its bin folder is on PATH.\n";
            return ['label' => 'cast-language-server (LSP)', 'status' => 'warn', 'detail' => 'installed, but not yet on PATH'];
        }

        echo "  \033[32m✔\033[0m cast-language-server resolvable at {$resolved}\n";
        return ['label' => 'cast-language-server (LSP)', 'status' => 'ok', 'detail' => $resolved];
    }

    /**
     * @param list<array{id: string, label: string, status: string, detail: string, remediation: string}> $report
     */
    private function statusFor(array $report, string $id): string
    {
        foreach ($report as $item) {
            if ($item['id'] === $id) {
                return $item['status'];
            }
        }

        return 'fail';
    }

    /**
     * @param list<string> $editors
     * @param array{assumeYes: bool, skipPhpactorPrompt: bool} $opts
     */
    private function printPlan(string $target, array $editors, array $opts): void
    {
        echo "Dry run — no changes will be made.\n\n";

        if ($target === 'extension' || $target === 'all') {
            $label = empty($editors) ? 'auto-detected editor(s)' : implode(', ', $editors);
            echo "  Would {$this->action} the CastFramework extension for: {$label}\n";
            if ($this->action !== 'uninstall') {
                echo "    then run npm ci/install --omit=dev in each target directory (for vscode-languageclient)\n";
            }
        }

        if ($target === 'lsp' || $target === 'all') {
            if ($this->action === 'uninstall') {
                echo "  Would run: npm uninstall -g cast-language-server\n";
            } else {
                $serverDir = RequirementsChecker::serverDir();
                echo "  Would run in {$serverDir}:\n";
                echo "    npm install\n";
                echo "    npm run build\n";
                echo "    npm install -g \"{$serverDir}\"\n";
                if (!(new PhpactorInstaller())->isInstalled() && !$opts['skipPhpactorPrompt']) {
                    echo "  Would prompt to download PHPactor (see requirements report above)\n";
                }
            }
        }

        echo "\n";
    }

    /**
     * @param list<array{label: string, status: string, detail: string}> $results
     */
    private function printSummary(array $results): void
    {
        echo "\n" . str_repeat('=', 72) . "\n";
        echo "  SUMMARY\n";
        foreach ($results as $r) {
            $icon = match ($r['status']) {
                'ok' => "\033[32m✔\033[0m",
                'warn' => "\033[33m!\033[0m",
                'skip' => "\033[33m-\033[0m",
                default => "\033[31m✘\033[0m",
            };
            echo "  {$icon} {$r['label']}: {$r['detail']}\n";
        }
        echo str_repeat('=', 72) . "\n\n";
    }

    private function actionVerb(): string
    {
        return match ($this->action) {
            'update' => 'Updating',
            'uninstall' => 'Uninstalling',
            default => 'Installing',
        };
    }

    private function actionVerbPast(): string
    {
        return match ($this->action) {
            'update' => 'updated',
            'uninstall' => 'uninstalled',
            default => 'installed',
        };
    }
}
