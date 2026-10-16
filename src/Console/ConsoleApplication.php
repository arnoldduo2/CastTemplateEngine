<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console;

use CastTemplateEngine\Console\Commands\EngineCheckCommand;
use CastTemplateEngine\Console\Commands\EngineClearCommand;
use CastTemplateEngine\Console\Commands\EngineCompileCommand;
use CastTemplateEngine\Console\Commands\EngineEditorCommand;
use CastTemplateEngine\Console\Commands\EngineSnippetsCommand;

final class ConsoleApplication
{
    private static bool $initialized = false;

    public static function init(): void
    {
        if (self::$initialized) return;
        self::$initialized = true;

        // Register default commands
        $checkCommand = new EngineCheckCommand();
        $astCommand = new \CastTemplateEngine\Console\Commands\EngineAstCommand();

        CommandRegistry::register('engine:check', $checkCommand);
        CommandRegistry::register('engine:lint', $checkCommand);
        CommandRegistry::register('lint', $checkCommand);

        CommandRegistry::register('engine:ast', $astCommand);
        CommandRegistry::register('ast', $astCommand);

        CommandRegistry::register('engine:compile', new EngineCompileCommand());
        CommandRegistry::register('engine:clear', new EngineClearCommand());
        CommandRegistry::register('engine:build', new \CastTemplateEngine\Console\Commands\EngineBuildCommand());
        CommandRegistry::register('engine:snippets', new EngineSnippetsCommand());
        CommandRegistry::register('engine:editor', new EngineEditorCommand());
    }

    /**
     * @param list<string> $argv
     */
    public static function run(array $argv): int
    {
        self::init();

        // Remove script name ($argv[0])
        array_shift($argv);

        if (empty($argv) || in_array($argv[0], ['--help', '-h', 'help'], true)) {
            self::printHelp();
            return 0;
        }

        // Support both "engine:check" and "engine check" or "engine editor install"
        $cmdName = $argv[0];
        $args = array_slice($argv, 1);

        if ($cmdName === 'engine' && !empty($args)) {
            $sub = array_shift($args);
            $cmdName = "engine:{$sub}";
        }

        $command = CommandRegistry::get($cmdName);
        if ($command === null) {
            echo "\033[31m[Cast Engine] Unknown command: \"{$cmdName}\"\033[0m\n\n";
            self::printHelp();
            return 1;
        }

        if ($command instanceof CommandInterface) {
            return $command->execute($args);
        }

        return $command($args);
    }

    private static function printHelp(): void
    {
        echo "\nCastTemplateEngine CLI Tool (v" . \CastTemplateEngine\CastTemplate::VERSION . ")\n";
        echo "Usage: php cast <command> [options]\n";
        echo "       php cast engine <command> [options]\n\n";
        echo "Available Commands:\n";

        foreach (CommandRegistry::all() as $name => $desc) {
            printf("  \033[32m%-22s\033[0m %s\n", $name, $desc);
        }

        echo "\nExamples:\n";
        echo "  php cast engine:check              Lint all .cast.php view files\n";
        echo "  php cast engine:compile            Precompile templates into cache folder\n";
        echo "  php cast engine:clear              Clear template cache\n";
        echo "  php cast engine:snippets           Show template code snippets\n";
        echo "  php cast engine:editor install     Install/Update VS Code extension\n\n";
    }
}
