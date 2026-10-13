<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console;

interface CommandInterface
{
    public function getName(): string;
    public function getDescription(): string;
    /**
     * @param list<string> $args
     * @return int Exit code (0 for success)
     */
    public function execute(array $args): int;
}
