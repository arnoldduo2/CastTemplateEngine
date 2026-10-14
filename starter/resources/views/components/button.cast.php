<?php
/**
 * A styled button or link.
 *
 * @var string $label Button label
 * @var string|null $href When set, renders as a link instead of a button
 * @var string $variant Visual style, e.g. "primary", "secondary"
 */
$label ??= 'Click me';
$href ??= null;
$variant ??= 'primary';
?>
@css(
.btn {
padding: 8px 16px;
border-radius: 4px;
border: none;
cursor: pointer;
}
.btn-primary {
background: @{ $variant === 'primary' ? '#2563eb' : '#6b7280' };
color: #fff;
}
)
@script(
handleEvent('click', '.btn', (e, el) => {
el.classList.add('btn-clicked');
});
)
<?php if ($href): ?>
    <a href="@{ $href }" class="btn btn-@{ $variant }"><?= $label ?></a>
<?php else: ?>
    <button type="button" class="btn btn-@{ $variant }"><?= $label ?></button>
<?php endif ?>
