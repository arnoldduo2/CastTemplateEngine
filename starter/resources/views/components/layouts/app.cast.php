<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>@{ $title ?? 'Cast Starter' }</title>
    @styles
</head>
<body>
    <Layouts.Header />
    <main class="container">
        <?= $children ?>
    </main>
    <Layouts.Footer />
    @scripts
</body>
</html>
