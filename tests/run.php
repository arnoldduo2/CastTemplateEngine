<?php

declare(strict_types=1);

// Dependency-free test runner: php tests/run.php

use CastTemplateEngine\CastTemplate;
use CastTemplateEngine\TemplateError;

spl_autoload_register(function (string $class) {
    $prefix = 'CastTemplateEngine\\';
    if (str_starts_with($class, $prefix)) {
        require __DIR__ . '/../src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    }
});
require __DIR__ . '/../src/helpers.php';

$tmp = sys_get_temp_dir() . '/cast-template-engine-tests-' . getmypid();
@mkdir("$tmp/views", 0777, true);
register_shutdown_function(fn() => exec('rm -rf ' . escapeshellarg($tmp)));

$engine = new CastTemplate(__DIR__ . '/components', '.cast.php', ['viewsDir' => "$tmp/views", 'cacheDir' => "$tmp/cache"]);
$failures = 0;
$count = 0;

/** Renders template source as a page view. */
function page(string $source, array $data = []): string
{
    global $engine, $tmp, $count;
    $name = 'page' . (++$count);
    file_put_contents("$tmp/views/$name.cast.php", $source);
    return $engine->render($name, $data);
}

function squash(string $html): string
{
    return trim(preg_replace('/>\s+</', '><', preg_replace('/\s+/', ' ', $html)));
}

function test(string $name, callable $fn): void
{
    global $failures;
    try {
        $fn();
        echo "  ok    $name\n";
    } catch (\Throwable $e) {
        $failures++;
        echo "  FAIL  $name\n        " . str_replace("\n", "\n        ", $e->getMessage()) . "\n";
    }
}

function same(string $expected, string $actual): void
{
    if (squash($expected) !== squash($actual)) {
        throw new Exception("expected: " . squash($expected) . "\nactual:   " . squash($actual));
    }
}

function throws(string $needle, callable $fn): void
{
    try {
        $fn();
    } catch (TemplateError $e) {
        if (!str_contains($e->getMessage(), $needle)) throw new Exception("wrong message: " . $e->getMessage());
        return;
    }
    throw new Exception("expected an error containing \"$needle\"");
}

echo "CastTemplate tests\n";

test('file names: kebab, snake and Pascal case', function () {
    same(
        '<div class="kpi"><div class="body">x</div></div>'
        . '<input type="text" name="a" value="">'
        . "<span class='badge'>b</span>",
        page('<KpiCard>x</KpiCard><Form.TextInput name="a" /><Badge text="b" />')
    );
});

test('unknown component is a compile error listing the paths tried', function () {
    throws('Component <Nope> not found. Looked for: nope.cast.php', fn() => page('<Nope />'));
});

test('prop keys are camelCased, including spread', function () {
    same(
        '{"hasLabel":true,"dataId":1,"fooBar":2,"children":""}',
        page('<DumpProps has_label data-id={1} {...$extra} />', ['extra' => ['foo_bar' => 2]])
    );
    same(
        '<div class="kpi"><label>Sales</label><div class="body"></div></div>',
        page('<KpiCard title="Sales" has-label />')
    );
});

test('string and expression props', function () {
    $p = ['qty' => 5, 'name' => 'Bolt'];
    same(
        '<input type="text" name="qty-5" value="Bolt">'
        . '<input type="text" name="qty-5" value="5">'
        . '<input type="text" name="qty-5" value="Bolt x">',
        page(<<<'TPL'
            <Form.TextInput name={"qty-{$p['qty']}"} value={$p['name']} />
            <Form.TextInput name={'qty-' . $p['qty']} value={$p['qty']} />
            <Form.TextInput name="qty-<?= $p['qty'] ?>" value="<?= $p['name'] ?> x" />
            TPL, ['p' => $p])
    );
});

test('children with native foreach and echo', function () {
    same(
        '<div class="kpi"><div class="body"><p>a</p><p>b</p></div></div>',
        page('<KpiCard><?php foreach ($rows as $r): ?><p><?= $r ?></p><?php endforeach ?></KpiCard>', ['rows' => ['a', 'b']])
    );
});

test('nested components and layouts', function () {
    same(
        '<html><title>Home</title><body><div class="kpi"><div class="body">'
        . "<span class='badge'>hi</span></div></div></body></html>",
        page('<Layouts.Main title="Home"><KpiCard><Badge text="hi" /></KpiCard></Layouts.Main>')
    );
});

test('<Slot> fills a named prop', function () {
    same(
        "<div class=\"row\"><div class=\"l\"><b>1</b><b>2</b></div><div class=\"r\">Stock</div></div>",
        page(<<<'TPL'
            <SelectItem right={$type}>
                <Slot name="left">
                    <?php foreach ([1, 2] as $i): ?><b><?= $i ?></b><?php endforeach ?>
                </Slot>
            </SelectItem>
            TPL, ['type' => 'Stock'])
    );
});

test('component tags inside { } props', function () {
    same(
        "<div class=\"row\"><div class=\"l\"><span class='badge'>Bolt <small>4</small></span></div><div class=\"r\">no</div></div>",
        page('<SelectItem left={<Badge text={$p["name"]} right={$p["qty"]} />} right={$ok ? <Badge text="yes" /> : "no"} />',
            ['p' => ['name' => 'Bolt', 'qty' => 4], 'ok' => false])
    );
});

test('HTML attributes with { } are escaped; true/false/null/arrays', function () {
    same(
        // Badge escapes & once, the attribute escapes its HTML again: the browser decodes it back to "A&amp;B"
        '<option data-html="&lt;span class=&#039;badge&#039;&gt;A&amp;amp;B&lt;/span&gt;" disabled data-x="{&quot;a&quot;:1}" value="3">x</option>',
        page('<option data-html={<Badge text={$name} />} disabled={true} hidden={false} title={null} data-x={["a" => 1]} value={$id}>x</option>',
            ['name' => 'A&B', 'id' => 3])
    );
});

test('quoted HTML attributes stay plain; components inside them give a hint', function () {
    same('<a href="/x?a=1&b=<?= 2 ?>" class=\'c\'>y</a>', page('<a href="/x?a=1&b=<?= "<?= 2 ?>" ?>" class=\'c\'>y</a>'));
    throws('Write data-html={<Badge ... />} instead', fn() => page('<option data-html="<Badge text=\'a\' />">x</option>'));
});

test('script, style, comments and comparisons are untouched', function () {
    $src = "<script>for (let i=0;i<Rows.length;i++){ if (a<b) x={y} }</script>"
        . "<style>a{b:c}</style><!-- <Badge text='x' /> --><?php if (1 <PHP_INT_MAX): ?>ok<?php endif ?> a < b && c={d} x<5";
    same(str_replace('<?php if (1 <PHP_INT_MAX): ?>ok<?php endif ?>', 'ok', $src), page($src));
});

test('components returning a string or echoing both work', function () {
    same("<span class='badge'>r</span>", page('<Badge text="r" />'));
});

test('compile errors: mismatched and unclosed tags, bad slot', function () {
    throws('Unexpected </Badge>, expected </KpiCard>', fn() => page("<KpiCard>\n</Badge>"));
    throws('<KpiCard> is never closed in', fn() => page('<KpiCard>x'));
    throws('must be placed directly inside a component', fn() => page('<Slot name="a">x</Slot>'));
    throws('must be self-closing', fn() => page('<SelectItem left={<KpiCard>x</KpiCard>} />'));
    throws('on line 2', fn() => page("<p>\n<Nope /></p>"));
});

test('compiled code keeps source line numbers', function () {
    try {
        page("<KpiCard\n  title={'a'}\n  has_label>\n<Badge\n text='x'\n/>\n<?php throw new LogicException('boom'); ?>\n</KpiCard>");
    } catch (LogicException $e) {
        if ($e->getLine() !== 7) throw new Exception('error reported on line ' . $e->getLine() . ', expected 7');
        if (ob_get_level() !== 0) throw new Exception('output buffers left open');
        return;
    }
    throw new Exception('no exception');
});

test('cache is reused and refreshed when the source changes', function () {
    global $tmp;
    file_put_contents("$tmp/views/cached.cast.php", '<Badge text="one" />');
    $engine = new CastTemplate(__DIR__ . '/components', '.cast.php', ['viewsDir' => "$tmp/views", 'cacheDir' => "$tmp/cache"]);
    same("<span class='badge'>one</span>", $engine->render('cached'));
    touch("$tmp/views/cached.cast.php", time() + 10);
    file_put_contents("$tmp/views/cached.cast.php", '<Badge text="two" />');
    touch("$tmp/views/cached.cast.php", time() + 10);
    $engine = new CastTemplate(__DIR__ . '/components', '.cast.php', ['viewsDir' => "$tmp/views", 'cacheDir' => "$tmp/cache"]);
    same("<span class='badge'>two</span>", $engine->render('cached'));
});


test('constructor: defaults, bad extension, unknown option, missing viewsDir', function () {
    global $tmp;
    $cast = new CastTemplate(__DIR__ . '/components', options: ['viewsDir' => "$tmp/views", 'cacheDir' => "$tmp/cache2"]);
    file_put_contents("$tmp/views/dflt.cast.php", '<Badge text="d" />');
    same("<span class='badge'>d</span>", $cast->render('dflt'));
    throws('Invalid extension "cast.php"', fn() => new CastTemplate('x', 'cast.php'));
    throws('Unknown CastTemplate option(s): cache', fn() => new CastTemplate('x', '.cast.php', ['cache' => 'y']));
    throws('Set the "viewsDir" option', fn() => (new CastTemplate(__DIR__ . '/components'))->render('x'));
    throws('View "missing" not found', fn() => $cast->render('missing'));
});

test('components folder relative to viewsDir; dotted view names', function () {
    global $tmp;
    @mkdir("$tmp/rel/components", 0777, true);
    @mkdir("$tmp/rel/pages", 0777, true);
    file_put_contents("$tmp/rel/components/hello.cast.php", 'Hello <?= e($who) ?>');
    file_put_contents("$tmp/rel/pages/home.cast.php", '<Hello who="World" />');
    $cast = new CastTemplate('components', '.cast.php', ['viewsDir' => "$tmp/rel", 'cacheDir' => "$tmp/cache3"]);
    same('Hello World', $cast->render('pages.home'));
});

test('shared data reaches views and components; explicit values win', function () {
    global $tmp;
    @mkdir("$tmp/sh/components", 0777, true);
    file_put_contents("$tmp/sh/components/who.cast.php", '<?= e($site) ?>/<?= e($user ?? "none") ?>');
    file_put_contents("$tmp/sh/page.cast.php", '<?= e($site) ?>|<Who />|<Who site="own" user="u" />|<?= e($user) ?>');
    $cast = new CastTemplate('components', '.cast.php', [
        'viewsDir' => "$tmp/sh", 'cacheDir' => "$tmp/cache4", 'shared' => ['site' => 'ERP', 'user' => 'shared'],
    ]);
    same('ERP|ERP/shared|own/u|page', $cast->render('page', ['user' => 'page']));
});

test('only the configured extension is compiled and resolved', function () {
    global $tmp;
    @mkdir("$tmp/ext/components", 0777, true);
    file_put_contents("$tmp/ext/components/plain.php", 'plain');
    file_put_contents("$tmp/ext/components/real.tpl.php", 'real');
    file_put_contents("$tmp/ext/page.tpl.php", '<Real />');
    file_put_contents("$tmp/ext/other.cast.php", '<Plain />');
    $cast = new CastTemplate('components', '.tpl.php', ['viewsDir' => "$tmp/ext", 'cacheDir' => "$tmp/cache5"]);
    same('real', $cast->render('page'));
    throws('not found', fn() => $cast->render('other'));
    file_put_contents("$tmp/ext/page2.tpl.php", '<Plain />');
    throws('Component <Plain> not found. Looked for: plain.tpl.php', fn() => $cast->render('page2'));
});

test('a template that starts with declare(strict_types=1) renders (the engine\'s own first line must not come before it)', function () {
    same('<p>2</p>', squash(page("<?php\n\ndeclare(strict_types=1);\n\$n = 2;\n?>\n<p><?= \$n ?></p>")));
    same('<p>2</p>', squash(page("<?php\n// a comment\ndeclare(strict_types=1);\n\$n = 2;\n?>\n<p><?= \$n ?></p>")));
    same('<i>ok</i>', squash(page("<?php /* one */ declare(strict_types = 0); ?><i>ok</i>")));
});

test('strict types really apply to the template once hoisted', function () {
    $out = page("<?php declare(strict_types=1);\nfunction takesInt(int \$x) { return \$x; }\ntry { takesInt('5'); echo 'loose'; } catch (TypeError \$e) { echo 'strict'; }\n?>");
    same('strict', trim($out));
});

test('a component that starts with declare(strict_types=1) works too', function () {
    global $tmp;
    @mkdir("$tmp/comp", 0777, true);
    file_put_contents("$tmp/comp/strict-one.cast.php", "<?php\n\ndeclare(strict_types=1);\n\$label ??= 'x';\n?>\n<em><?= \$label ?></em>");
    $own = new CastTemplate("$tmp/comp", '.cast.php', ['viewsDir' => "$tmp/views", 'cacheDir' => "$tmp/cache2"]);
    file_put_contents("$tmp/views/usesone.cast.php", '<StrictOne label="hi" />');
    same('<em>hi</em>', squash($own->render('usesone')));
});

function takes_string(string $s): string { return $s; }

test('an error in a template is reported in the template, not in the compiled copy', function () {
    global $engine, $tmp;
    // a warning-style error raised by the template itself, on line 3
    file_put_contents("$tmp/views/err_a.cast.php", "<h1>Hi</h1>\n<p>ok</p>\n<?php throw new RuntimeException('boom in the view @ /x/' . basename(__FILE__)); ?>\n");
    try {
        $engine->render('err_a');
        throw new Exception('did not throw');
    } catch (RuntimeException $e) {
        same("$tmp/views/err_a.cast.php", $e->getFile());
        same('3', (string) $e->getLine());
        foreach ($e->getTrace() as $frame) {
            if (isset($frame['file']) && str_contains($frame['file'], '/cache/')) throw new Exception('a frame still points to the compiled copy: ' . $frame['file']);
        }
    }
});

test('a helper that rejects its argument is traced to the line of the template that called it', function () {
    global $engine, $tmp;
    file_put_contents("$tmp/views/err_b.cast.php", "<div>\n<b>one</b>\n<?= takes_string(null) ?>\n</div>\n");
    try {
        $engine->render('err_b');
        throw new Exception('did not throw');
    } catch (TypeError $e) {
        same("$tmp/views/err_b.cast.php", $e->getFile());
        same('3', (string) $e->getLine());
        if (str_contains($e->getMessage(), '/cache/')) throw new Exception('message still names the compiled copy: ' . $e->getMessage());
        if (!str_contains($e->getMessage(), "$tmp/views/err_b.cast.php")) throw new Exception('message does not name the template: ' . $e->getMessage());
    }
});

test('errors in a component are traced to the component file and line', function () {
    global $engine, $tmp;
    file_put_contents("$tmp/views/err_c.cast.php", "<p>before</p>\n<Boom />\n");
    @mkdir("$tmp/comp2", 0777, true);
    file_put_contents("$tmp/comp2/boom.cast.php", "<?php\n\n\$x = takes_string(123 + 'a' === 1 ? 1 : null);\n");
    $own = new CastTemplate("$tmp/comp2", '.cast.php', ['viewsDir' => "$tmp/views", 'cacheDir' => "$tmp/cache7"]);
    try {
        $own->render('err_c');
        throw new Exception('did not throw');
    } catch (Throwable $e) {
        same("$tmp/comp2/boom.cast.php", $e->getFile());
    }
});

test('a leading declare(strict_types) keeps the line numbers of the template', function () {
    global $engine, $tmp;
    file_put_contents("$tmp/views/err_d.cast.php", "<?php\n\ndeclare(strict_types=1);\n?>\n<p>x</p>\n<?php throw new LogicException('l6'); ?>\n");
    try {
        $engine->render('err_d');
    } catch (LogicException $e) {
        same("$tmp/views/err_d.cast.php", $e->getFile());
        same('6', (string) $e->getLine());
    }
});

test('@{ } prints like <?= ?>, with nested braces, strings and method calls', function () {
    same('<p>Hi Ann</p>', page('<p>Hi @{ $user->name }</p>', ['user' => (object) ['name' => 'Ann']]));
    same('<p>b 2 }</p>', page("<p>@{ \$a['k'] } @{ count([1, 2]) } @{ '}' }</p>", ['a' => ['k' => 'b']]));
    same('<p>x</p>', page('<p>@{$v}</p>', ['v' => 'x']));
    same('<p>big</p>', page('<p>@{ $n > 3 ? "big" : "small" }</p>', ['n' => 5]));
    same('<p><b>raw</b></p>', page('<p>@{ $h }</p>', ['h' => '<b>raw</b>']));
});

test('@for, @foreach and @while, with or without the colon, nested', function () {
    same('<li>The current value is 0</li><li>The current value is 1</li><li>The current value is 2</li>', page("@for (\$i = 0; \$i < 3; \$i++):\n<li>The current value is @{ \$i }</li>\n@endfor"));
    same('<li>0</li><li>1</li>', page('@for ($i = 0; $i < 2; $i++)<li>@{ $i }</li>@endfor'));
    same('<p>This is user 1</p><p>This is user 2</p>', page("@foreach (\$users as \$user):\n<p>This is user @{ \$user->id }</p>\n@endforeach", ['users' => [(object) ['id' => 1], (object) ['id' => 2]]]));
    same('a:1 b:2', page('@foreach ($m as $k => $v): @{ $k }:@{ $v } @endforeach', ['m' => ['a' => 1, 'b' => 2]]));
    same('3 2 1', page('@while ($n > 0) @{ $n-- } @endwhile', ['n' => 3]));
    same('1a 1b 2a 2b', page('@foreach ([1, 2] as $x): @foreach (["a", "b"] as $y): @{ $x }@{ $y } @endforeach @endforeach'));
});

test('@forelse ... @empty ... @endforelse', function () {
    $tpl = "@forelse (\$users as \$user):\n<li>@{ \$user->name }</li>\n@empty\n<p>No users</p>\n@endforelse";
    same('<li>Ann</li><li>Bo</li>', page($tpl, ['users' => [(object) ['name' => 'Ann'], (object) ['name' => 'Bo']]]));
    same('<p>No users</p>', page($tpl, ['users' => []]));
    same('<p>No users</p>', page($tpl, ['users' => new ArrayIterator([])]));
    same('<li>Ann</li>', page($tpl, ['users' => (function () { yield (object) ['name' => 'Ann']; })()]), 'a generator is walked once');
    same('x1 y', page('@forelse ($a as $i): x@{ $i } @empty none @endforelse @forelse ($b as $i): y @empty none @endforelse', ['a' => [1], 'b' => [1]]), 'two loops in a row keep their own flags');
    same('x1 none', page('@forelse ($a as $i): x@{ $i } @empty A @endforelse @forelse ($b as $i): y @empty none @endforelse', ['a' => [1], 'b' => []]));
    same('in:p out:none', page('@forelse ($o as $p): in:@{ $p } @forelse ([] as $q): q @empty out:none @endforelse @empty e @endforelse', ['o' => ['p']]), 'a @forelse inside a @forelse');
    same('<li>1</li>', page('@forelse ($a as $i)<li>@{ $i }</li>@endforelse', ['a' => [1]]), 'no @empty block is fine');
});

test('@if, @elseif, @else, @endif, @break and @continue', function () {
    $tpl = '@if ($n > 5): big @elseif ($n > 2): mid @else: small @endif';
    same('big', page($tpl, ['n' => 9]));
    same('mid', page($tpl, ['n' => 3]));
    same('small', page($tpl, ['n' => 1]));
    same('small', page('@if ($n > 5) big @else small @endif', ['n' => 1]));
    same('1 2', page('@foreach ([1, 2, 3, 4] as $i) @if ($i > 2) @break @endif @{ $i } @endforeach'));
    same('1 3', page('@foreach ([1, 2, 3] as $i) @continue($i === 2) @{ $i } @endforeach'));
    same('1 2', page('@foreach ([1, 2, 3] as $i) @break($i === 3) @{ $i } @endforeach'));
});

test('mixed with components, <?php ?>, plain <?= ?> and nested parentheses', function () {
    same('<div class="kpi"><div class="body">x</div></div><div class="kpi"><div class="body">y</div></div>', page('@foreach (["x", "y"] as $t): <KpiCard title="a">@{ $t }</KpiCard> @endforeach'));
    same('1-2', page('<?php $a = [1, 2]; ?>@foreach ($a as $i)<?= $i ?>@if ($i === 1)-@endif@endforeach'));
    same('ok', page("@if (in_array('a)', ['a)', 'b'])) ok @endif"));
    same('a,b', page('@{ implode(",", array_map(fn($x) => strtolower($x), ["A", "B"])) }'));
});

test('left alone: @@, e-mail addresses, CSS @rules, <style> and <?php ?> blocks, unknown words', function () {
    same('me@example.com', page('me@example.com'));
    same('write @ me', page('write @ me'));
    same('@for and @{x}', page('@@for and @@{x}'));
    same('<style>@media (min-width: 1px) { a { color: red } }</style>', page('<style>@media (min-width: 1px) { a { color: red } }</style>'));
    same('<style>a { color: #fff }</style>', page('<style>a { color: @{ "#fff" } }</style>'));
    same('x @if', page('<?php echo "x @if"; ?>'));
    same('@import @media', page('@import @media'));
    same('hello@for.com', page('hello@for.com'));
    same('<a href="/@user">me</a>', page('<a href="/@user">@{ $u }</a>', ['u' => 'me']));
});

test('a newline after @{ } is kept, and directives never move a line', function () {
    global $engine, $tmp;
    if (page("@{ 'a' }\nb\n") !== "a\nb\n") throw new Exception('the newline after @{ } was lost: ' . json_encode(page("@{ 'a' }\nb\n")));
    file_put_contents("$tmp/views/dir_a.cast.php", "@foreach ([1] as \$i):\n  <p>@{ \$i }</p>\n@endforeach\n@if (true)\n<?php throw new LogicException('l5'); ?>\n@endif\n");
    try {
        $engine->render('dir_a');
        throw new Exception('did not throw');
    } catch (LogicException $e) {
        same("$tmp/views/dir_a.cast.php", $e->getFile());
        same('5', (string) $e->getLine());
    }
    file_put_contents("$tmp/views/dir_b.cast.php", "@foreach ([1] as \$i):\n  <p>@{ \$i\n  + 1 }</p>\n@endforeach\n<?php throw new LogicException('l5'); ?>\n");
    try {
        $engine->render('dir_b');
    } catch (LogicException $e) {
        same('5', (string) $e->getLine());
    }
});

test('mistakes in directives are reported with the template and line', function () {
    throws('@foreach is never closed in', fn() => page("<p>a</p>\n@foreach (\$x as \$y):\n<p>b</p>"));
    throws('on line 2', fn() => page("<p>a</p>\n@foreach (\$x as \$y):\n<p>b</p>"));
    throws('@endfor has no matching @for', fn() => page("<p>a</p>\n@endfor"));
    throws('@endforeach has no matching @foreach (the open block is @for, from line 1', fn() => page("@for (\$i = 0; \$i < 1; \$i++):\n@endforeach"));
    throws('@else has no matching @if', fn() => page('@else'));
    throws('@empty has no matching @forelse', fn() => page('@foreach ([] as $a) @empty @endforeach'));
    throws('@break is only allowed inside a loop', fn() => page('@break'));
    throws('needs an expression in parentheses', fn() => page('@foreach $x as $y'));
    throws('has nothing in it', fn() => page('@{ }'));
    throws('has nothing in it', fn() => page('@if () x @endif'));
    throws('a ( is never closed', fn() => page('@if ($a x @endif'));
    throws('@empty is used twice', fn() => page('@forelse ([] as $a) @empty @empty @endforelse'));
});

test('@switch / @case / @default, @unless, @isset and @php', function () {
    $tpl = "@switch (\$n):\n    @case (1)\n        one\n        @break\n    @case (2)\n    @case (3)\n        two or three\n        @break\n    @default\n        many\n@endswitch";
    same('one', page($tpl, ['n' => 1]));
    same('two or three', page($tpl, ['n' => 3]));
    same('many', page($tpl, ['n' => 9]));
    same('b', page("@switch (\$s) @case ('a') a @break @case ('b') b @break @endswitch", ['s' => 'b']));
    same('1 many', page('@foreach ([1, 7] as $i) @switch ($i) @case (1) 1 @break @default many @endswitch @endforeach'));
    same('shown', page('@unless ($hidden): shown @endunless', ['hidden' => false]));
    same('', page('@unless ($hidden): shown @endunless', ['hidden' => true]));
    same('else', page('@unless ($hidden): shown @else: else @endunless', ['hidden' => true]));
    same('has', page('@isset ($x): has @endisset', ['x' => 1]));
    same('none', page('@isset ($x): has @else none @endisset'));
    same('7 7', page('@php($n = 7) @{ $n } @php $m = $n; @endphp @{ $m }'));
    same('a;b', page("@php\n\$parts = ['a', 'b'];\n@endphp\n@{ implode(';', \$parts) }"));
    same('@php @{ x }', page('<?php echo "@php @{ x }"; ?>'));
    throws('@switch must be followed by @case or @default', fn() => page('@switch ($n) x @endswitch'));
    throws('@case has no matching @switch', fn() => page('@case (1)'));
    throws('@php is never closed', fn() => page('@php $a = 1;'));
    throws('@endphp has no matching @php', fn() => page('@endphp'));
    throws('@endswitch has no matching @switch', fn() => page('@endswitch'));
});

echo $failures ? "\n$failures failed\n" : "\nall passed\n";
exit($failures ? 1 : 0);
