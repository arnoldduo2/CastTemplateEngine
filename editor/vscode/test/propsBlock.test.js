"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { parsePropsBlock } = require("../lib/propsBlock");

test("lib/propsBlock degrades to a safe empty result (never throws) when cast-language-core fails to load", () => {
  const original = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "cast-language-core") throw new Error("simulated: npm install never ran");
    return original.call(this, request, ...rest);
  };
  delete require.cache[require.resolve("../lib/propsBlock")];
  let degraded;
  try {
    degraded = require("../lib/propsBlock");
  } finally {
    Module._load = original;
    delete require.cache[require.resolve("../lib/propsBlock")];
  }

  assert.deepEqual(degraded.parsePropsBlock("@props { string $x; }"), { props: [], extends: null, start: null, end: null, markupBefore: null });
  assert.equal(degraded.firstMarkupOffset("x<?php ?>"), null);
});

test("the full grammar: types, nullable, unions, trailing comments, defaults, a required (no-default) entry", () => {
  const src = `<?php

declare(strict_types=1);

?>
@props{
string $tag = 'button';
string $variant = 'solid'; // solid, outline, soft, theme
?string $icon = null;
bool $disabled = false;
array|string $attr = [];
string $label;
};
<button></button>`;
  const r = parsePropsBlock(src);
  assert.equal(r.markupBefore, null, "nothing before @props{} should count as markup");
  const by = Object.fromEntries(r.props.map((p) => [p.name, p]));

  assert.deepEqual(by.tag, { name: "tag", type: "string", description: "", required: false, default: "'button'", values: [], kind: "string", deprecated: false, inferred: false });
  assert.equal(by.variant.default, "'solid'");
  assert.equal(by.icon.type, "?string");
  assert.equal(by.icon.required, false, "has a default (null), even though nullable");
  assert.equal(by.disabled.kind, "bool");
  assert.equal(by.attr.type, "array|string");
  assert.equal(by.attr.default, "[]");
  assert.equal(by.label.required, true, "no default at all = required");
  assert.equal(by.label.default, null);
});

test("a trailing ; after the closing } is optional, both forms recognized (matches the two shapes seen in real use)", () => {
  const withSemi = parsePropsBlock("<?php ?>\n@props{ string $x = 'a'; };\n<div></div>");
  const withoutSemi = parsePropsBlock("<?php ?>\n@props{ string $x = 'a'; }\n<div></div>");
  assert.equal(withSemi.props.length, 1);
  assert.equal(withoutSemi.props.length, 1);
  assert.equal(withSemi.props[0].default, "'a'");
  assert.equal(withoutSemi.props[0].default, "'a'");
});

test("a comma inside a default's own array literal or function call is not mistaken for an entry separator", () => {
  const r = parsePropsBlock("<?php ?>\n@props{ array $a = ['x', 'y']; string $b = somefn('p', 'q'); }\n<div></div>");
  const by = Object.fromEntries(r.props.map((p) => [p.name, p]));
  assert.equal(by.a.default, "['x', 'y']");
  assert.equal(by.b.default, "somefn('p', 'q')");
});

test("a complex default expression survives verbatim: a function call, a class constant", () => {
  const r = parsePropsBlock("<?php ?>\n@props{\nstring $a = somefunction('$arg');\nstring $b = Cast\\App\\Application::VERSION;\n}\n<div></div>");
  const by = Object.fromEntries(r.props.map((p) => [p.name, p]));
  assert.equal(by.a.default, "somefunction('$arg')");
  assert.equal(by.b.default, "Cast\\App\\Application::VERSION");
});

test("markupBefore reports where real markup precedes @props{} - a real compile error in the PHP engine, surfaced here for the editor to flag too", () => {
  const r = parsePropsBlock("<?php ?>\n<button>x</button>\n@props{ string $a = 'b'; }");
  assert.notEqual(r.markupBefore, null);
  assert.equal(r.props.length, 1, "still parses what it can, even when flagged");
});

test("no @props{} block at all: the none shape, same as a component with no docblock either", () => {
  const r = parsePropsBlock("<div>hello</div>");
  assert.deepEqual(r, { props: [], extends: null, start: null, end: null, markupBefore: null });
});

test("an unsupported type name is not rejected (unlike the PHP compiler): the editor is informational, not enforcement", () => {
  const r = parsePropsBlock("<?php ?>\n@props{ Foo $x; }\n<div></div>");
  assert.equal(r.props.length, 1);
  assert.equal(r.props[0].type, "Foo");
});

test("@props extends::Dotted.Path{}: the dotted path is reported, alongside this block's own (override/addition) entries", () => {
  const r = parsePropsBlock("<?php ?>\n@props extends::Btns.Btn{\nstring $margin = 'mx-1';\n}\n<div></div>");
  assert.equal(r.extends, "Btns.Btn");
  assert.deepEqual(r.props.map((p) => p.name), ["margin"]);
});

test("a plain @props{} (no extends::) reports extends as null", () => {
  const r = parsePropsBlock("<?php ?>\n@props{ string $x = 'a'; }\n<div></div>");
  assert.equal(r.extends, null);
});

test("odd input does not throw", () => {
  for (const s of ["", "@props", "@props{", "@props{}", "@props{;;;}", "@props{ $x; }", "<?php ?>\n@props{ string; }", "@props extends::", "@props extends::{", "@props extends::Foo"]) {
    assert.doesNotThrow(() => parsePropsBlock(s), s);
  }
});
