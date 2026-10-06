<?php
$right ??= '';
return "<span class='badge'>" . e($text) . ($right !== '' ? " <small>" . e($right) . "</small>" : '') . "</span>";
