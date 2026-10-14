<?php
$features ??= [
    ['title' => 'Components', 'description' => 'React-style tags on native PHP templates.'],
    ['title' => 'Directives', 'description' => '@if, @foreach, @map and friends.'],
    ['title' => 'Zero build step', 'description' => 'Runs on plain PHP, no bundler required.'],
];
?>
<Layouts.App title="Home">
    <section class="hero">
        <h1>Welcome to Cast</h1>
        <p>A small template engine with components, directives and collections.</p>
        <Button label="Get started" href="/about" variant="primary" />
    </section>
    <section class="features">
        @foreach ($features as $feature)
            <Card title={$feature['title']}>
                <p>@{ $feature['description'] }</p>
            </Card>
        @endforeach
    </section>
</Layouts.App>
