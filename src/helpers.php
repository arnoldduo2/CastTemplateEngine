<?php

declare(strict_types=1);

if (!function_exists('e')) {
    /** Escape a value for HTML output: <?= e($name) ?> */
    function e(mixed $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
