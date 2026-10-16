<?php

declare(strict_types=1);

namespace CastTemplateEngine;

final class TemplateError extends \RuntimeException
{
    public function __construct(string $message, ?string $file = null, ?int $line = null, int $code = 0, ?\Throwable $previous = null)
    {
        parent::__construct($message, $code, $previous);
        if ($file !== null) $this->file = $file;
        if ($line !== null) $this->line = $line;
    }
}
