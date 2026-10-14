<?php
$text ??= '';
$position ??= 'top';
?>
<span class="tooltip tooltip-@{ $position }" data-tooltip="@{ $text }"><?= $children ?></span>
