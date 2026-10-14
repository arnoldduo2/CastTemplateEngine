<?php
/**
 * Modal dialog, closed by default.
 *
 * @var string $id DOM id used to target this modal from JS
 * @var string $title Dialog title
 * @var ?string $size Dialog width: "sm", "md" (default) or "lg" [optional]
 *
 * @slot default The dialog body
 * @slot footer Optional footer actions (e.g. buttons)
 *
 * @example <Modal id="confirm-delete" title="Delete item?"><p>This cannot be undone.</p></Modal>
 *
 * @deprecated use the Dialog component instead
 */
$size ??= 'md';
?>
<div id="@{ $id }" class="modal modal-@{ $size }" hidden>
    <div class="modal-header"><?= $title ?></div>
    <div class="modal-body"><?= $children ?></div>
    <Slot name="footer" />
</div>
