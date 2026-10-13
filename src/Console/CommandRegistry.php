<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console;

/**
 * CommandRegistry manages all template engine console commands.
 * Open and extendable: CastFramework or custom user scripts can register commands here.
 */
final class CommandRegistry
{
    /** @var array<string, CommandInterface|callable(list<string>): int> */
    private static array $commands = [];

    /** @var array<string, string> */
    private static array $descriptions = [];

    /**
     * Registers a console command.
     *
     * @param string $name Command name (e.g. 'engine:check' or 'custom:task')
     * @param CommandInterface|callable(list<string>): int $handler
     * @param string $description Description shown in help
     */
    public static function register(string $name, CommandInterface|callable $handler, string $description = ''): void
    {
        self::$commands[$name] = $handler;
        if ($handler instanceof CommandInterface) {
            self::$descriptions[$name] = $handler->getDescription();
        } elseif ($description !== '') {
            self::$descriptions[$name] = $description;
        }
    }

    /**
     * Finds a command by name or alias (e.g. 'engine:check' matches 'engine check').
     */
    public static function get(string $name): CommandInterface|callable|null
    {
        if (isset(self::$commands[$name])) {
            return self::$commands[$name];
        }

        // Try normalized aliases
        $normalized = str_replace(' ', ':', $name);
        return self::$commands[$normalized] ?? null;
    }

    /**
     * Returns all registered commands with their descriptions.
     *
     * @return array<string, string>
     */
    public static function all(): array
    {
        return self::$descriptions;
    }

    /**
     * Resets the registry (useful for testing).
     */
    public static function reset(): void
    {
        self::$commands = [];
        self::$descriptions = [];
    }
}
