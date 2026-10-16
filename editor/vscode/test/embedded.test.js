"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  findEchoHoles,
  findBraceExpressions,
  findDirectiveArguments,
  findEmbeddedBlocks,
  findScopes,
  scopesAt,
  scopeText,
  FUNCTION_DIRECTIVES,
  maskAll,
  buildPhpVirtual,
  buildBlockVirtual,
  buildScopedVirtual,
  buildCallVirtual,
  offsetToLineChar,
  lineCharToOffset,
} = require("../lib/embedded");

const at = (src, span) => src.slice(span.start, span.end);
const expr = (src, span) => src.slice(span.exprStart, span.exprEnd);

test("findEchoHoles: finds @{ ... } spans and their inner expression, nested braces aware", () => {
  const src = "<td>@{$item['id']}</td><td>@{__money($item['price'])}</td>";
  const holes = findEchoHoles(src);
  assert.equal(holes.length, 2);
  assert.equal(at(src, holes[0]), "@{$item['id']}");
  assert.equal(expr(src, holes[0]), "$item['id']");
  assert.equal(expr(src, holes[1]), "__money($item['price'])");
});

test("findEchoHoles: a hole whose expression itself contains braces stays balanced", () => {
  const src = "@{ return(<li>@{ $x }</li>) }";
  const holes = findEchoHoles(src);
  assert.equal(holes.length, 1, "the inner @{ $x } is part of the same balanced expression, not a second hole");
  assert.equal(expr(src, holes[0]), " return(<li>@{ $x }</li>) ");
});

test("findEchoHoles: inactive inside <?php ?> / <?= ?>, same as the real compiler", () => {
  const src = "<?php $x = '@{ $hidden }'; ?>\n@{ $shown }";
  const holes = findEchoHoles(src);
  assert.equal(holes.length, 1);
  assert.equal(expr(src, holes[0]), " $shown ");
});

test("findEchoHoles: live inside <script>/<style>/<!-- --> (the compiler does not skip these for @{ })", () => {
  const src = "<script>var x = 1; /* @{ $inScript } */</script><style>.a{color:@{ $inStyle };}</style><!-- @{ $inComment } -->";
  const holes = findEchoHoles(src);
  assert.deepEqual(
    holes.map((h) => expr(src, h)),
    [" $inScript ", " $inStyle ", " $inComment "]
  );
});

test("findEchoHoles: an unclosed hole does not hang and stops further scanning", () => {
  const src = "before @{ $unclosed text after";
  assert.doesNotThrow(() => findEchoHoles(src));
  assert.equal(findEchoHoles(src).length, 0);
});

test("findBraceExpressions: finds =` { ... } ` attribute expressions, distinct from @{ } holes", () => {
  const src = '<li key={$item[\'id\']} class="x" data-id={$item[\'id\']} data-price={$item[\'price\']}>';
  const exprs = findBraceExpressions(src);
  assert.deepEqual(
    exprs.map((e) => expr(src, e)),
    ["$item['id']", "$item['id']", "$item['price']"]
  );
});

test("findBraceExpressions: not confused by @{ } holes (no = before them) or arrow functions (=> not ={)", () => {
  const src = "@map($items, ($item, $i) => $item)<td>@{ $item.id }</td>";
  assert.deepEqual(findBraceExpressions(src), []);
});

test("findBraceExpressions: inactive inside <? ?> (e.g. real PHP string interpolation like \"a={$y}\")", () => {
  const src = '<?php $x = "a={$y}"; ?>\n<a href={route(\'/\')}>x</a>';
  const exprs = findBraceExpressions(src);
  assert.equal(exprs.length, 1);
  assert.equal(expr(src, exprs[0]), "route('/')");
});

test("findDirectiveArguments: finds @if/@foreach/@map/... argument spans, excludes @css/@script/@js and no-arg directives", () => {
  const src = "@if (count($items) > 0)\n@foreach ($items as $item)\n@map($items, ($item) => $item)\n@endforeach\n@endif\n@styles";
  const args = findDirectiveArguments(src);
  assert.deepEqual(
    args.map((a) => expr(src, a)),
    ["count($items) > 0", "$items as $item", "$items, ($item) => $item"]
  );
});

test("findDirectiveArguments: finds whitelisted framework-helper directives too (@htchars, @route, @cast, @modules)", () => {
  const src = "@htchars($x) @route('/') @cast($g) @modules('app', 'css')";
  const args = findDirectiveArguments(src);
  assert.deepEqual(
    args.map((a) => expr(src, a)),
    ["$x", "'/'", "$g", "'app', 'css'"]
  );
});

test("findDirectiveArguments: @map/@filter's return(<markup/>)/@render(<markup/>) is excluded from the PHP bridge - markup isn't PHP and would break the virtual document's parse", () => {
  const mapSrc = "@map($items, ($item, $i) => return(<Card key={$i}>@{ $item->name }</Card>))";
  const mapArgs = findDirectiveArguments(mapSrc);
  assert.equal(mapArgs.length, 1);
  assert.equal(expr(mapSrc, mapArgs[0]), "$items, ($item, $i) => ", "stops right before return(, never includes the markup");
  assert.ok(!expr(mapSrc, mapArgs[0]).includes("<Card"), "no markup leaks into the bridged PHP span");

  const renderSrc = "@map($items, ($item, $i) => @render(<Card>@{ $item->name }</Card>))";
  assert.equal(expr(renderSrc, findDirectiveArguments(renderSrc)[0]), "$items, ($item, $i) => ", "@render(...) is excluded the same way as return(...)");

  // @filter's 2-arg standalone form has no return()/markup at all - a plain PHP predicate - so nothing is excluded
  const filterSrc = "@filter($items, ($item) => $item->qty > 0)";
  assert.equal(expr(filterSrc, findDirectiveArguments(filterSrc)[0]), "$items, ($item) => $item->qty > 0");
});

test("findDirectiveArguments: records the directive word, so a FUNCTION_DIRECTIVES caller can tell which real function it maps to", () => {
  const src = "@route(route: '/' ,params:[\"\"=>\"\"] )";
  const args = findDirectiveArguments(src);
  assert.equal(args.length, 1);
  assert.equal(args[0].word, "route");
  assert.equal(FUNCTION_DIRECTIVES[args[0].word], "route");

  const ifSrc = "@if (count($items) > 0)";
  assert.equal(findDirectiveArguments(ifSrc)[0].word, "if");
});

test("buildCallVirtual: wraps the argument text in an actual call, giving named-argument labels real call context", () => {
  const virt = buildCallVirtual("route", "route: '/' ,params:[\"\"=>\"\"] ");
  assert.equal(virt, "<?php route(route: '/' ,params:[\"\"=>\"\"] )");
});

test("offsetToLineChar / lineCharToOffset: round-trip on a multi-line string, including at line starts/ends", () => {
  const text = "<?php route(route: '/' ,\n  params:[\"\"=>\"\"] )";
  for (const offset of [0, 7, 12, 24, 25, 27, text.length]) {
    const lc = offsetToLineChar(text, offset);
    assert.equal(lineCharToOffset(text, lc), offset, `round-trip failed for offset ${offset}`);
  }
  assert.deepEqual(offsetToLineChar(text, 12), { line: 0, character: 12 }, "offset 12 is the start of the first 'route:' label");
  assert.deepEqual(offsetToLineChar(text, 25), { line: 1, character: 0 }, "offset right after the newline is column 0 of line 1");
});

test("findScopes: @map/@filter's own ($item, $i) => params aren't real PHP (missing fn) and wouldn't leak scope even with it added (arrow-fn params are local to their own body) - a synthetic foreach stands in instead, since a loop variable does leak", () => {
  const src = "@map($items, ($item, $i) => return(<li>@{ $item['id'] }</li>))after";
  const scopes = findScopes(src);
  assert.equal(scopes.length, 1);
  assert.equal(scopes[0].kind, "synthetic");
  assert.equal(scopeText(src, scopes[0]), "foreach ($items as $i => $item)");
  const holeOffset = src.indexOf("$item['id']");
  assert.ok(holeOffset > scopes[0].bodyStart && holeOffset < scopes[0].bodyEnd, "the nested hole falls inside the scope's body");
  const afterOffset = src.indexOf("after");
  assert.ok(afterOffset >= scopes[0].bodyEnd, "text after the call's own closing ) is out of scope");
});

test("findScopes: a single-parameter @map/@filter callback gets `as $value`, not `as $key => $value`", () => {
  const src = "@filter($items, ($item) => return(@{ $item['id'] }))";
  const scopes = findScopes(src);
  assert.equal(scopes.length, 1);
  assert.equal(scopeText(src, scopes[0]), "foreach ($items as $item)");
});

test("findScopes: @foreach/@forelse/@for/@while expose their own real keyword+args verbatim (so it parses as real control flow, and PHP's own flat scoping makes the loop variable visible later), visible from their ) to the matching @end<word>, depth-aware for same-kind nesting", () => {
  const src = "@foreach ($items as $item)\n@foreach ($item['sub'] as $s)\n@{ $s }\n@endforeach\n@{ $item }\n@endforeach\nafter";
  const scopes = findScopes(src);
  assert.equal(scopes.length, 2);
  assert.ok(scopes.every((s) => s.kind === "verbatim"));
  assert.equal(scopeText(src, scopes[0]), "foreach ($items as $item)");
  assert.equal(scopeText(src, scopes[1]), "foreach ($item['sub'] as $s)");
  const sOffset = src.indexOf("$s }");
  const outerItemOffset = src.lastIndexOf("$item }");
  const afterOffset = src.indexOf("after");
  assert.ok(sOffset > scopes[1].bodyStart && sOffset < scopes[1].bodyEnd, "$s is in the inner foreach's own body");
  assert.ok(sOffset > scopes[0].bodyStart && sOffset < scopes[0].bodyEnd, "the inner body is still nested inside the outer foreach's body too");
  assert.ok(outerItemOffset > scopes[0].bodyStart && outerItemOffset < scopes[0].bodyEnd, "the outer $item is visible in the outer body");
  assert.ok(!(outerItemOffset > scopes[1].bodyStart && outerItemOffset < scopes[1].bodyEnd), "but not inside the inner foreach's own (already-closed) body");
  assert.ok(afterOffset >= scopes[0].bodyEnd, "text after the matching @endforeach is out of scope");
});

test("scopesAt: returns every enclosing scope, outermost first, for a nested span", () => {
  const src = "@foreach ($items as $item)\n@map($item['children'], ($c) => return(\n@{ $c['id'] }\n))\n@endforeach";
  const offset = src.indexOf("$c['id']");
  const found = scopesAt(src, offset).map((s) => scopeText(src, s));
  assert.deepEqual(found, ["foreach ($items as $item)", "foreach ($item['children'] as $c)"]);
});

test("buildScopedVirtual: builds <?php + scopePrefix + head + body + tail, the general case for a span that needs more than position-preserving masking can give it", () => {
  assert.equal(buildScopedVirtual("", "", "$x", ""), "<?php $x");
  assert.equal(buildScopedVirtual("foreach ($a as $x); ", "", "$x", ""), "<?php foreach ($a as $x); $x");
  assert.equal(buildScopedVirtual("", "route(", "$x", ")"), "<?php route($x)");
});

test("buildCallVirtual: an optional scopePrefix is placed before fnName(, so a variable from an enclosing scope resolves too", () => {
  const virt = buildCallVirtual("route", "$path", "foreach ($items as [$label, $path]); ");
  assert.equal(virt, "<?php foreach ($items as [$label, $path]); route($path)");
  assert.equal(buildCallVirtual("route", "$path"), "<?php route($path)", "omitted scopePrefix = old behaviour, unchanged");
});

test("findEmbeddedBlocks: finds @css(/@script(/@js( bodies with nested @{ } holes recorded relative to the full source", () => {
  const src = "before\n@css(\n  .a { color: @{ $c }; }\n)\nmiddle\n@script(\n  handleEvent('click', 'a', () => {});\n)\nafter";
  const blocks = findEmbeddedBlocks(src);
  assert.deepEqual(blocks.map((b) => b.kind), ["css", "script"]);
  assert.equal(blocks[0].holes.length, 1);
  assert.equal(expr(src, blocks[0].holes[0]), " $c ");
  // the hole's offsets are relative to the whole document, not the block body
  assert.equal(src.slice(blocks[0].holes[0].start, blocks[0].holes[0].end), "@{ $c }");
  assert.equal(blocks[1].holes.length, 0);
});

test("findEmbeddedBlocks: a multi-line body (no args on the opening line) is still found whole", () => {
  const src = "@script(\nfunction f() {\n  return 1;\n}\n)";
  const blocks = findEmbeddedBlocks(src);
  assert.equal(blocks.length, 1);
  assert.match(src.slice(blocks[0].bodyStart, blocks[0].bodyEnd), /function f\(\)/);
});

test("maskAll: every character becomes a space except newlines, length and newline positions unchanged", () => {
  const src = "ab\ncd{}@{}";
  const masked = maskAll(src);
  assert.equal(masked.length, src.length);
  assert.deepEqual(
    [...masked].map((c, i) => (src[i] === "\n" ? c === "\n" : c === " ")),
    src.split("").map(() => true)
  );
  assert.equal(maskAll("a\n\nb"), " \n\n ");
});

test("buildPhpVirtual: starts with <?php, keeps every other character's offset and every line's length identical", () => {
  const src = "<?php\n\ndeclare(strict_types=1);\n?>\n<td>@{$item['id']}</td>";
  const hole = findEchoHoles(src)[0];
  const virt = buildPhpVirtual(src, hole.exprStart, hole.exprEnd);
  assert.match(virt, /^<\?php/);
  assert.equal(virt.length, src.length);
  const srcLines = src.split("\n");
  const virtLines = virt.split("\n");
  assert.equal(virtLines.length, srcLines.length, "no newline was consumed or added");
  srcLines.forEach((l, i) => assert.equal(virtLines[i].length, l.length, `line ${i} length preserved`));
  assert.match(virt, /\$item\['id'\]/, "the expression itself survives, unmasked");
});

test("buildBlockVirtual: keeps only the block's own body (with its nested holes) intact, same length as the source", () => {
  const src = "<div></div>\n@css(\n  .a { color: @{ $c }; }\n)\n<p>text</p>";
  const block = findEmbeddedBlocks(src)[0];
  const virt = buildBlockVirtual(src, block);
  assert.equal(virt.length, src.length);
  assert.equal(virt.split("\n").length, src.split("\n").length);
  assert.match(virt, /\.a \{ color: @\{ \$c \}; \}/, "the body, including its own @{ } hole, is untouched");
  assert.ok(!virt.includes("<div>") && !virt.includes("<p>text</p>"), "everything outside the block is masked");
});
