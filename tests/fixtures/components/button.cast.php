<?php
/**
 * Button component
 *
 * @var string $label The button label
 * @var string $type Button type, e.g. "button", "submit", "reset"
 * @var string|null $href When set, renders as a link instead of a button
 * @var string|null $variant Visual style, e.g. "primary", "secondary", "ghost"
 */
$label ??= 'Click me';
$type ??= 'button';
$href ??= null;
$variant ??= 'primary';
?>
<?php if ($href): ?>
<a href="@{ $href }" class="btn btn-@{ $variant }"><?= $label ?></a>
<?php else: ?>
<button type="@{ $type }" class="btn btn-@{ $variant }"><?= $label ?></button>
<?php endif ?>
