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

echo $failures ? "\n$failures failed\n" : "\nall passed\n";
exit($failures ? 1 : 0);
