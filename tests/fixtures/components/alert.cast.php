<?php
/**
 * Alert banner for flash messages.
 *
 * @var string $message The alert message
 * @var string $type Alert type, e.g. "info", "success", "warning", "danger"
 * @var string $level Old alert level. @deprecated use type instead
 */
$message ??= '';
$type ??= 'info';
?>
<div class="alert alert-@{ $type }"><?= $message ?></div>
