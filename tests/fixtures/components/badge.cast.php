<?php
/**
 * Badge component: a small pill, optionally a dot indicator or a numeric count.
 *
 * @var string $text Badge text
 * @var bool $dot Show a leading dot instead of text
 * @var int $count Number to display instead of text
 */
$text ??= '';
$dot ??= false;
$count ??= 0;
?>
<span class="badge">
<?php if ($dot): ?>
<i class="dot"></i>
<?php endif ?>
<?= $count > 0 ? $count : $text ?>
</span>
