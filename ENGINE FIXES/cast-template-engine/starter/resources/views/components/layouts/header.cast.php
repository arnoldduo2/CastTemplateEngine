<?php
$links = [
    ['label' => 'Home', 'href' => '/'],
    ['label' => 'About', 'href' => '/about'],
    ['label' => 'Contact', 'href' => '/contact'],
];
?>
<header class="site-header">
    <a href="/" class="logo">Cast Starter</a>
    <nav>
        <ul>
            @foreach ($links as $link)
                <NavItem label={$link['label']} href={$link['href']} />
            @endforeach
        </ul>
    </nav>
</header>
