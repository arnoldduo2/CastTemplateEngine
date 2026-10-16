<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Support;

final class ProcessResult
{
    public function __construct(
        public readonly int $exitCode,
        public readonly string $output,
    ) {
    }

    public function isSuccess(): bool
    {
        return $this->exitCode === 0;
    }
}
