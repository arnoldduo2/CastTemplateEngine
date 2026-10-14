<?php
/**
 * Avatar component with a complex prop type and a required callback.
 *
 * @var array<string, mixed> $user The user record (name, avatarUrl)
 * @var callable(array): string $onClick Called with the user record when clicked
 * @var int|float $size Pixel size of the avatar
 */
$size ??= 40;
?>
<img
    src="@{ $user['avatarUrl'] }"
    alt="@{ $user['name'] }"
    width="@{ $size }"
    height="@{ $size }"
/>
