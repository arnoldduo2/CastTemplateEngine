<?php
/** A plain text input field, with props inferred from their defaults. */
$name ??= '';
$value ??= '';
$placeholder ??= null;
$required ??= false;
?>
<input
    type="text"
    name="@{ $name }"
    value="@{ $value }"
    placeholder="@{ $placeholder }"
    <?php if ($required): ?>required<?php endif ?>
/>
