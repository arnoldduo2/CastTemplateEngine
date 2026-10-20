<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Support;

/**
 * Detects and, with explicit confirmation, downloads the PHPactor phar that
 * editor/server/src/php/engine.ts looks for at editor/server/bin/phpactor.phar.
 */
final class PhpactorInstaller
{
    // Pinned release — verified against GitHub's own asset digest (and an independent
    // sha256sum of the downloaded file) when this was written. Not "latest": bumping
    // this version requires re-verifying the checksum below against the new release.
    private const VERSION = '2026.10.07.0';
    private const SHA256 = 'b28bf6166e016d539fc2f2aec18ef918b12590e436a6f1ccbdf30b5bbdbdb16b';
    private const SIZE_BYTES = 4_815_663;

    private const DOWNLOAD_URL = 'https://github.com/phpactor/phpactor/releases/download/' . self::VERSION . '/phpactor.phar';

    public function isInstalled(): bool
    {
        return is_file(RequirementsChecker::phpactorPharPath());
    }

    public function printInfo(): void
    {
        $sizeMb = round(self::SIZE_BYTES / 1_000_000, 1);
        $destination = RequirementsChecker::phpactorPharPath();

        echo "\n  PHPactor powers PHP-aware features in the Cast language server\n";
        echo "  (hover and go-to-definition into embedded PHP code). Without it,\n";
        echo "  Cast template features still work fully — only PHP-bridging is disabled.\n\n";
        echo "    Source:      " . self::DOWNLOAD_URL . "\n";
        echo "    Version:     " . self::VERSION . " (pinned, checksum-verified)\n";
        echo "    Size:        ~{$sizeMb} MB\n";
        echo "    Destination: {$destination}\n\n";
    }

    public function promptConfirm(bool $assumeYes): bool
    {
        if ($assumeYes) {
            return true;
        }

        if (!self::isInteractive()) {
            return false;
        }

        echo '  Install PHPactor now? [Y/n] ';
        $answer = strtolower(trim((string) fgets(STDIN)));

        return $answer === '' || $answer === 'y' || $answer === 'yes';
    }

    private static function isInteractive(): bool
    {
        if (!defined('STDIN')) {
            return false;
        }

        if (function_exists('stream_isatty')) {
            return @stream_isatty(STDIN);
        }

        return function_exists('posix_isatty') && @posix_isatty(STDIN);
    }

    public function download(): bool
    {
        $destination = RequirementsChecker::phpactorPharPath();
        $destinationDir = dirname($destination);

        if (!is_dir($destinationDir) && !@mkdir($destinationDir, 0777, true) && !is_dir($destinationDir)) {
            echo "  \033[31m✘\033[0m Could not create {$destinationDir}\n";
            return false;
        }

        $tmpFile = $destinationDir . DIRECTORY_SEPARATOR . 'phpactor.phar.download';

        echo '  Downloading ' . self::DOWNLOAD_URL . " ...\n";

        if (!$this->fetch(self::DOWNLOAD_URL, $tmpFile)) {
            echo "  \033[31m✘\033[0m Download failed.\n";
            @unlink($tmpFile);
            return false;
        }

        $actualHash = hash_file('sha256', $tmpFile);
        if ($actualHash !== self::SHA256) {
            echo "  \033[31m✘\033[0m Checksum mismatch (expected " . self::SHA256 . ", got {$actualHash}). Discarding download.\n";
            @unlink($tmpFile);
            return false;
        }

        if (!@rename($tmpFile, $destination)) {
            echo "  \033[31m✘\033[0m Could not move downloaded file into place at {$destination}\n";
            @unlink($tmpFile);
            return false;
        }

        if (PHP_OS_FAMILY === 'Windows') {
            self::patchForWindows($destination);
        } else {
            @chmod($destination, 0755);
        }

        echo "  \033[32m✔\033[0m PHPactor installed at {$destination}\n";
        return true;
    }

    private function fetch(string $url, string $destination): bool
    {
        if (function_exists('curl_init')) {
            return $this->fetchWithCurl($url, $destination);
        }

        return $this->fetchWithStream($url, $destination);
    }

    private function fetchWithCurl(string $url, string $destination): bool
    {
        $fp = @fopen($destination, 'wb');
        if ($fp === false) {
            return false;
        }

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
        curl_setopt($ch, CURLOPT_FILE, $fp);
        curl_setopt($ch, CURLOPT_TIMEOUT, 120);
        curl_setopt($ch, CURLOPT_USERAGENT, 'cast-template-engine-installer');
        $success = curl_exec($ch) !== false && curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 200;
        curl_close($ch);
        fclose($fp);

        if (!$success) {
            @unlink($destination);
        }

        return $success;
    }

    private function fetchWithStream(string $url, string $destination): bool
    {
        if (!ini_get('allow_url_fopen')) {
            echo "  \033[31m✘\033[0m Neither the curl extension nor allow_url_fopen is available — cannot download automatically.\n";
            return false;
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'follow_location' => 1,
                'max_redirects' => 5,
                'timeout' => 120,
                'header' => "User-Agent: cast-template-engine-installer\r\n",
            ],
        ]);

        $contents = @file_get_contents($url, false, $context);
        if ($contents === false) {
            return false;
        }

        return @file_put_contents($destination, $contents) !== false;
    }

    public static function patchForWindows(string $destination): bool
    {
        $php = (new RequirementsChecker())->resolvePhpBinary() ?? 'php';
        $script = <<<'PHP'
$dest = $argv[1];
$extractDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'phpactor_extract_' . uniqid();
@mkdir($extractDir, 0777, true);
try {
    $p = new Phar($dest);
    $p->extractTo($extractDir, null, true);
    $binPath = $extractDir . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'phpactor';
    if (is_file($binPath)) {
        $c = file_get_contents($binPath);
        $c = str_replace(
            "['mbstring', 'posix', 'tokenizer']",
            "DIRECTORY_SEPARATOR === '\\\\' ? ['mbstring', 'tokenizer'] : ['mbstring', 'posix', 'tokenizer']",
            $c
        );
        file_put_contents($binPath, $c);
    }
    unset($p);
    @unlink($dest);
    $newPhar = new Phar($dest);
    $newPhar->buildFromDirectory($extractDir);
    $stub = <<<'STUB'
#!/usr/bin/env php
<?php
Phar::mapPhar('phpactor.phar');
require 'phar://phpactor.phar/bin/phpactor';
__HALT_COMPILER(); ?>
STUB;
    $newPhar->setStub($stub);
    unset($newPhar);
    return 0;
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    return 1;
} finally {
    if (is_dir($extractDir)) {
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($extractDir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $item) {
            $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }
        @rmdir($extractDir);
    }
}
PHP;

        $res = ProcessRunner::run([$php, '-d', 'phar.readonly=0', '-r', $script, $destination]);
        return $res->isSuccess();
    }
}

