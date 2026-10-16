<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Support;

/**
 * Runs external processes (node, npm, where/which, ...) for the editor installer commands.
 * This is the first place in the PHP codebase that shells out to anything.
 */
final class ProcessRunner
{
    /**
     * @param list<string> $command
     */
    public static function run(array $command, ?string $cwd = null, bool $stream = true): ProcessResult
    {
        $isWindows = PHP_OS_FAMILY === 'Windows';

        // On Windows, npm/npx/node-based CLIs are frequently .cmd/.bat shims that CreateProcess
        // can't execute directly; routing through "cmd /c" resolves them (and PATH) the same way
        // a real shell would. Using the array form (not a string) means no manual escaping is
        // needed — each element is passed through as a literal argument.
        if ($isWindows) {
            // Resolve bare shim names (npm, npx, ...) to an absolute .cmd/.exe path first. Otherwise
            // cmd may pick the extensionless bash script or resolve the shim's own directory
            // (%~dp0) against the working directory, so npm can't find its own node_modules.
            $command[0] = self::resolveWindowsExecutable($command[0]);
        }
        $fullCommand = $isWindows ? array_merge(['cmd', '/c'], $command) : $command;

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = proc_open($fullCommand, $descriptors, $pipes, $cwd);
        if (!is_resource($process)) {
            return new ProcessResult(1, 'Failed to start process: ' . implode(' ', $command) . "\n");
        }

        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $output = '';
        do {
            $status = proc_get_status($process);

            foreach ([1, 2] as $fd) {
                $chunk = stream_get_contents($pipes[$fd]);
                if ($chunk === false || $chunk === '') {
                    continue;
                }
                $output .= $chunk;
                if ($stream) {
                    echo $chunk;
                }
            }

            if ($status['running']) {
                usleep(50_000);
            }
        } while ($status['running']);

        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);

        return new ProcessResult($exitCode, $output);
    }

    private static function resolveWindowsExecutable(string $binary): string
    {
        if (preg_match('/[\\\\\/]/', $binary) === 1 || in_array(strtolower($binary), ['cmd', 'where'], true)) {
            return $binary;
        }

        foreach (['.cmd', '.exe', '.bat'] as $suffix) {
            $lines = [];
            @exec('where ' . escapeshellarg($binary . $suffix) . ' 2>NUL', $lines, $code);
            if ($code !== 0) {
                continue;
            }
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line !== '' && is_file($line)) {
                    return $line;
                }
            }
        }

        return $binary;
    }

    /**
     * Resolves a binary on PATH via `where` (Windows) / `which` (POSIX).
     */
    public static function resolveOnPath(string $binary): ?string
    {
        $isWindows = PHP_OS_FAMILY === 'Windows';
        $result = self::run($isWindows ? ['where', $binary] : ['which', $binary], null, false);

        if (!$result->isSuccess()) {
            return null;
        }

        foreach (explode("\n", $result->output) as $line) {
            $line = trim($line);
            if ($line !== '' && file_exists($line)) {
                return $line;
            }
        }

        return null;
    }
}
