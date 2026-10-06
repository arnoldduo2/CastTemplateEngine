<?php
$title ??= 'KPI';
$hasLabel ??= false;
?>
<div class="kpi">
    <?php if ($hasLabel): ?><label><?= e($title) ?></label><?php endif ?>
    <div class="body"><?= $children ?></div>
</div>
