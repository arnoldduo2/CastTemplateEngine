<?php
/**
 * Dismissible alert banner.
 *
 * @var string $message Alert message
 * @var string $type Alert type, e.g. "info", "success", "warning", "danger"
 * @var bool $dismissible Show a close button
 */
$message ??= '';
$type ??= 'info';
$dismissible ??= false;
?>
<div class="alert alert-@{ $type }">
    <span><?= $message ?></span>
    <?php if ($dismissible): ?>
        <button type="button" class="alert-close">&times;</button>
    <?php endif ?>
</div>
