<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Support;

/**
 * Checks the system requirements for installing/running the editor extension
 * and the cast-language-server, and reports pass/warn/fail per item.
 */
final class RequirementsChecker
{
    /** @var list<string> */
    private const PHP_EXTENSIONS = ['mbstring', 'tokenizer', 'phar', 'ctype', 'json'];

    /** Mirrors editor/server/src/php/engine.ts's findPhpBinary() Windows fallback list. */
    private const PHP_FALLBACK_PATHS = [
        'D:\\APPDEV\\xampp\\php\\php.exe',
        'C:\\xampp\\php\\php.exe',
        'C:\\tools\\php\\php.exe',
        'C:\\php\\php.exe',
    ];

    /**
     * @return list<array{id: string, label: string, status: 'ok'|'warn'|'fail', detail: string, remediation: string}>
     */
    public function checkAll(): array
    {
        return [
            $this->checkPhpVersion(),
            $this->checkNode(),
            $this->checkNpm(),
            $this->checkPhpExtensions(),
            $this->checkPhpactorPhar(),
            $this->checkServerBuilt(),
        ];
    }

    /**
     * @return array{id: string, label: string, status: 'ok'|'warn'|'fail', detail: string, remediation: string}
     */
    private function checkPhpVersion(): array
    {
        $ok = PHP_VERSION_ID >= 80100;

        return [
            'id' => 'php',
            'label' => 'PHP',
            'status' => $ok ? 'ok' : 'fail',
            'detail' => PHP_VERSION,
            'remediation' => $ok ? '' : 'Cast requires PHP >= 8.1.',
        ];
    }

    /**
     * @return array{id: string, label: string, status: 'ok'|'warn'|'fail', detail: string, remediation: string}
     */
    private function checkNode(): array
    {
        $path = ProcessRunner::resolveOnPath('node');
        if ($path === null) {
            return [
                'id' => 'node',
                'label' => 'Node.js',
                'status' => 'fail',
                'detail' => 'not found on PATH',
                'remediation' => 'Install Node.js 18+ from https://nodejs.org and re-run. Required to build/install the language server.',
            ];
        }

        $version = trim(ProcessRunner::run([$path, '-v'], null, false)->output);
        $major = (int) preg_replace('/^v?(\d+).*/s', '$1', $version !== '' ? $version : 'v0');

        return [
            'id' => 'node',
            'label' => 'Node.js',
            'status' => $major >= 18 ? 'ok' : 'warn',
            'detail' => $version !== '' ? $version : 'unknown version',
            'remediation' => $major >= 18 ? '' : "Node 18+ is recommended (found {$version}).",
        ];
    }

    /**
     * @return array{id: string, label: string, status: 'ok'|'warn'|'fail', detail: string, remediation: string}
     */
    private function checkNpm(): array
    {
        $path = ProcessRunner::resolveOnPath('npm');

        return [
            'id' => 'npm',
            'label' => 'npm',
            'status' => $path === null ? 'fail' : 'ok',
            'detail' => $path ?? 'not found on PATH',
            'remediation' => $path === null ? 'npm ships with Node.js — install Node.js 18+ from https://nodejs.org.' : '',
        ];
    }

    public function resolvePhpBinary(): ?string
    {
        $path = ProcessRunner::resolveOnPath('php');
        if ($path !== null) {
            return $path;
        }

        foreach (self::PHP_FALLBACK_PATHS as $fallback) {
            if (is_file($fallback)) {
                return $fallback;
            }
        }

        return null;
    }

    /**
     * @return array{id: string, label: string, status: 'ok'|'warn'|'fail', detail: string, remediation: string}
     */
    private function checkPhpExtensions(): array
    {
        $php = $this->resolvePhpBinary();
        if ($php === null) {
            return [
                'id' => 'php-extensions',
                'label' => 'PHP extensions (for PHPactor)',
                'status' => 'warn',
                'detail' => 'could not locate a PHP binary to inspect',
                'remediation' => 'Ensure a PHP binary is on PATH so PHPactor can use it for full PHP intelligence.',
            ];
        }

        $loaded = array_map('strtolower', array_map('trim', explode("\n", ProcessRunner::run([$php, '-m'], null, false)->output)));
        $missing = array_values(array_diff(self::PHP_EXTENSIONS, $loaded));

        return [
            'id' => 'php-extensions',
            'label' => 'PHP extensions (for PHPactor)',
            'status' => empty($missing) ? 'ok' : 'warn',
            'detail' => empty($missing) ? implode(', ', self::PHP_EXTENSIONS) : 'missing: ' . implode(', ', $missing),
            'remediation' => empty($missing) ? '' : 'Enable the missing PHP extension(s) above in php.ini for full PHPactor support.',
        ];
    }

    /**
     * @return array{id: string, label: string, status: 'ok'|'warn'|'fail', detail: string, remediation: string}
     */
    private function checkPhpactorPhar(): array
    {
        $path = self::phpactorPharPath();
        $exists = is_file($path);

        return [
            'id' => 'phpactor',
            'label' => 'PHPactor (PHP intelligence)',
            'status' => $exists ? 'ok' : 'warn',
            'detail' => $exists ? $path : "not found at {$path}",
            'remediation' => $exists ? '' : "Confirm the download prompt during install, or place a phpactor.phar there manually.",
        ];
    }

    /**
     * @return array{id: string, label: string, status: 'ok'|'warn'|'fail', detail: string, remediation: string}
     */
    private function checkServerBuilt(): array
    {
        $path = self::serverEntryPath();
        $exists = is_file($path);

        return [
            'id' => 'server-built',
            'label' => 'cast-language-server build',
            'status' => $exists ? 'ok' : 'warn',
            'detail' => $exists ? $path : 'not built yet (dist/server.js missing)',
            'remediation' => $exists ? '' : 'Will be built automatically during install.',
        ];
    }

    public static function serverDir(): string
    {
        return (string) realpath(__DIR__ . '/../../../editor/server');
    }

    public static function languageCoreDir(): string
    {
        return (string) realpath(__DIR__ . '/../../../editor/language-core');
    }

    public static function phpactorPharPath(): string
    {
        return self::serverDir() . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'phpactor.phar';
    }

    public static function serverEntryPath(): string
    {
        return self::serverDir() . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'server.js';
    }
}
