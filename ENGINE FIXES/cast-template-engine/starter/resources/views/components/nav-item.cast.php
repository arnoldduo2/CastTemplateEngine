<?php
/**
 * A single navigation link.
 *
 * @var string $label Link text
 * @var string $href Link target
 */
$label ??= '';
$href ??= '#';
?>
<li>
    <a href="@{ $href }"><?= $label ?></a>
</li>
