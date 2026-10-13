"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { formatText, indentFor, computeIndents } = require("../lib/indent");

const fmt = (s, o) => formatText(s, o);

test("HTML and component tags indent their children; void and self-closing tags do not", () => {
  const out = fmt(`<div class="a">\n<p>hi</p>\n<img src="x">\n<br>\n<Card title="t">\n<Btns.Button label="s" />\n<Slot name="f">x</Slot>\n</Card>\n</div>`);
  assert.equal(out, `<div class="a">\n    <p>hi</p>\n    <img src="x">\n    <br>\n    <Card title="t">\n        <Btns.Button label="s" />\n        <Slot name="f">x</Slot>\n    </Card>\n</div>`);
});

test("tabs and other widths", () => {
  assert.equal(fmt("<div>\n<p>x</p>\n</div>", { tabSize: 2 }), "<div>\n  <p>x</p>\n</div>");
  assert.equal(fmt("<div>\n<p>x</p>\n</div>", { insertSpaces: false }), "<div>\n\t<p>x</p>\n</div>");
});

test("a tag whose attributes go over several lines: the attributes are one level in, the > is back at the tag", () => {
  const out = fmt(`<div>\n<Card title="x"\ntotal={$t > 3 ? 1 : 2}\nfn={fn() => 1}\n>\n<p/>\n</Card>\n</div>`);
  assert.equal(out, `<div>\n    <Card title="x"\n        total={$t > 3 ? 1 : 2}\n        fn={fn() => 1}\n    >\n        <p/>\n    </Card>\n</div>`);
});

test("PHP alternative syntax: if/elseif/else/endif, foreach, while, switch, on one line each", () => {
  const out = fmt(`<ul>\n<?php foreach ($a as $b): ?>\n<li>\n<?php if ($b): ?>\n<b>1</b>\n<?php elseif ($c): ?>\n<i>2</i>\n<?php else: ?>\n<u>3</u>\n<?php endif ?>\n</li>\n<?php endforeach ?>\n</ul>`);
  assert.equal(out, `<ul>\n    <?php foreach ($a as $b): ?>\n        <li>\n            <?php if ($b): ?>\n                <b>1</b>\n            <?php elseif ($c): ?>\n                <i>2</i>\n            <?php else: ?>\n                <u>3</u>\n            <?php endif ?>\n        </li>\n    <?php endforeach ?>\n</ul>`);
});

test("a multi-line <?php ... ?> block keeps its code at the level of <?php, with braces and parentheses nested", () => {
  const out = fmt(`<div>\n<?php\n$a = 1;\nif ($a) {\nforeach ([1, 2] as $i) {\necho foo(\n$i,\n2\n);\n}\n}\n?>\n<p>after</p>\n</div>`);
  assert.equal(out, `<div>\n    <?php\n    $a = 1;\n    if ($a) {\n        foreach ([1, 2] as $i) {\n            echo foo(\n                $i,\n                2\n            );\n        }\n    }\n    ?>\n    <p>after</p>\n</div>`);
});

test("strings, comments and ternaries do not confuse PHP nesting", () => {
  const out = fmt(`<div>\n<?php\n$s = "{ ( [";  // } ) ]\n$t = '}';\n/* { */\n$x = $a ? 1 : 2;\n?>\n<p>x</p>\n</div>`);
  assert.equal(out, `<div>\n    <?php\n    $s = "{ ( [";  // } ) ]\n    $t = '}';\n    /* { */\n    $x = $a ? 1 : 2;\n    ?>\n    <p>x</p>\n</div>`);
});

test("@ directives: if/elseif/else, foreach, forelse/empty, for, while, unless, isset, switch/case", () => {
  const out = fmt(`<div>\n@if ($x):\n<ul>\n@foreach ($u as $i)\n<li>@{ $i }</li>\n@endforeach\n</ul>\n@elseif ($y)\n<b>y</b>\n@else\n<i>n</i>\n@endif\n@forelse ($l as $i)\n<li>@{ $i }</li>\n@empty\n<p>none</p>\n@endforelse\n@unless ($h)\nv\n@endunless\n@isset ($z)\nw\n@endisset\n@for ($i = 0; $i < 2; $i++)\n@while (false)\nx\n@endwhile\n@endfor\n@switch ($n)\n@case (1)\none\n@break\n@case (2)\ntwo\n@break\n@default\nmany\n@endswitch\n</div>`);
  assert.equal(out, `<div>
    @if ($x):
        <ul>
            @foreach ($u as $i)
                <li>@{ $i }</li>
            @endforeach
        </ul>
    @elseif ($y)
        <b>y</b>
    @else
        <i>n</i>
    @endif
    @forelse ($l as $i)
        <li>@{ $i }</li>
    @empty
        <p>none</p>
    @endforelse
    @unless ($h)
        v
    @endunless
    @isset ($z)
        w
    @endisset
    @for ($i = 0; $i < 2; $i++)
        @while (false)
            x
        @endwhile
    @endfor
    @switch ($n)
        @case (1)
            one
            @break
        @case (2)
            two
            @break
        @default
            many
    @endswitch
</div>`);
});

test("@php blocks keep their code; @php(...) is a statement; @@ and e-mail addresses are not directives", () => {
  const out = fmt(`<div>\n@php\n$x = 1;\n   keep();\n@endphp\n@php($n = 5)\n<p>me@if.com @@if</p>\n</div>`);
  assert.equal(out, `<div>\n    @php\n$x = 1;\n   keep();\n    @endphp\n    @php($n = 5)\n    <p>me@if.com @@if</p>\n</div>`);
});

test("lines inside <script>, <style>, <pre>, <textarea>, comments and heredocs are left alone", () => {
  const src = `<div>\n<script>\n  let a = 1;\n      if (a) { a++ }\n</script>\n<style>\n a { color: red }\n</style>\n<pre>\n  keep\n   this\n  </pre>\n<!-- a\n     comment -->\n<?php\n$t = <<<EOT\n   heredoc { text\nEOT;\n?>\n<p>x</p>\n</div>`;
  const out = fmt(src).split("\n");
  const kept = ["  let a = 1;", "      if (a) { a++ }", " a { color: red }", "  keep", "   this", "  </pre>", "     comment -->", "   heredoc { text"];
  for (const line of kept) assert.ok(out.includes(line), `kept: ${JSON.stringify(line)}`);
  assert.ok(out.includes("    </script>") && out.includes("    </style>"), "the closing tags of script and style are indented");
  assert.ok(out.includes("    <p>x</p>"), "what follows is back to normal (the heredoc did not leak)");
  assert.ok(out.includes("    EOT;") || out.includes("EOT;"), "the heredoc terminator");
});

test("a closer that matches nothing is ignored; markup opened in one @if branch and closed after is tolerated", () => {
  const out = fmt(`</div>\n<p>a</p>\n@if ($a)\n<div class="x">\n@else\n<div class="y">\n@endif\n<p>in</p>\n</div>\n<p>out</p>`);
  assert.equal(out.split("\n").at(-1), "<p>out</p>", "back at the start after the branches");
  assert.equal(out.split("\n")[1], "<p>a</p>", "an ambiguous file (tags opened in branches) is not shifted by its stray closer");
});

test("a partial that closes tags another file opened (layouts/footer) is indented as if inside them", () => {
  const footer = `<?php $a = 1; ?>\n</main>\n<footer>\n<p>x</p>\n</footer>\n</body>\n</html>`;
  assert.equal(fmt(footer), `<?php $a = 1; ?>\n    </main>\n    <footer>\n        <p>x</p>\n    </footer>\n</body>\n</html>`);
});

test("<html> does not indent its children; <head> and <body> do", () => {
  assert.equal(fmt("<!DOCTYPE html>\n<html>\n<head>\n<title>x</title>\n</head>\n<body>\n<p>y</p>\n</body>\n</html>"), "<!DOCTYPE html>\n<html>\n<head>\n    <title>x</title>\n</head>\n<body>\n    <p>y</p>\n</body>\n</html>");
});

test("blank lines stay empty, line endings are kept", () => {
  assert.equal(fmt("<div>\r\n   \r\n<p>x</p>\r\n</div>"), "<div>\r\n\r\n    <p>x</p>\r\n</div>");
});

test("it is idempotent, and the framework's own views already follow it", () => {
  const root = path.join(__dirname, "..", "..", "..", "starter", "resources", "views");
  const files = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) f.isDirectory() ? walk(path.join(dir, f.name)) : f.name.endsWith(".cast.php") && files.push(path.join(dir, f.name));
  })(root);
  assert.ok(files.length > 10);
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const once = fmt(src);
    assert.equal(once, src, `${path.relative(root, file)} is already formatted`);
    assert.equal(fmt(once), once, "idempotent");
  }
});

test("indentFor: the indent of a new line is the depth after the lines above; a closer line goes back", () => {
  const lines = ["<div>", "    <?php if ($a): ?>", ""];
  assert.equal(indentFor(lines, 2), "        ");
  assert.equal(indentFor(["<div>", "<p>", "</p>", "    </div>"], 3), "");
  assert.equal(indentFor(["@if ($a)", "x", "        @endif"], 2), "");
  assert.equal(indentFor(["<div>", "  <pre>", "  x"], 2), null, "inside <pre> nothing moves");
  assert.deepEqual(computeIndents(["<a>", "", "</a>"]).depths, [0, null, 0]);
});
