<?php
/**
 * Card with a title and a body slot.
 *
 * @var string $title Card title
 */
$title ??= '';
?>
<div class="card">
    <h3 class="card-title"><?= $title ?></h3>
    <div class="card-body">
        <?= $children ?>
    </div>
</div>
