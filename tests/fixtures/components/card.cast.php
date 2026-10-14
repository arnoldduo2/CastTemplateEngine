<?php
/**
 * Card component with a header slot and a body slot.
 *
 * @var string $title Card title, shown above the header slot
 *
 * @slot header Optional header content, rendered above the title
 * @slot default The card body
 *
 * @example <Card title="Welcome"><p>Body text</p></Card>
 * @example <Card title="Welcome"><Slot name="header"><b>Header</b></Slot><p>Body</p></Card>
 */
$title ??= '';
?>
<div class="card">
    <Slot name="header" />
    <h3><?= $title ?></h3>
    <div class="card-body"><?= $children ?></div>
</div>
