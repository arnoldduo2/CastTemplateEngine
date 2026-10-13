"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseComponent, camel, readType, splitUnion } = require("../lib/docblock");

const fixtures = path.join(__dirname, "..", "..", "..", "tests", "fixtures", "components");

test("every shared fixture gives exactly the JSON in its .expected.json (the PHP reader is tested against the same files)", () => {
  const files = fs.readdirSync(fixtures).filter((f) => f.endsWith(".cast.php"));
  assert.ok(files.length >= 8);
  for (const file of files) {
    const expected = JSON.parse(fs.readFileSync(path.join(fixtures, file.replace(".cast.php", ".expected.json")), "utf8"));
    assert.deepEqual(parseComponent(fs.readFileSync(path.join(fixtures, file), "utf8")), expected, file);
  }
});

test("the Button example: description, types, descriptions, allowed values and defaults", () => {
  const spec = parseComponent(fs.readFileSync(path.join(fixtures, "button.cast.php"), "utf8"));
  assert.equal(spec.description, "Button component");
  assert.deepEqual(spec.props.map((p) => p.name), ["label", "type", "href", "variant"]);
  const variant = spec.props[3];
  assert.equal(variant.type, "string|null");
  assert.deepEqual(variant.values, ["primary", "secondary", "ghost"]);
  assert.equal(variant.default, "'primary'");
  assert.equal(variant.required, false);
  assert.deepEqual(spec.props[1].values, ["button", "submit", "reset"]);
});

test("types are read whole: unions with spaces, generics, callables with return types", () => {
  assert.deepEqual(readType("'asc' | 'desc' | null $order Sorted"), { type: "'asc' | 'desc' | null", rest: " $order Sorted" });
  assert.equal(readType("array<string, mixed> $o").type, "array<string, mixed>");
  assert.equal(readType("callable(int, string): bool $f").type, "callable(int, string): bool");
  assert.equal(readType("Closure(int): void|null $f x").type, "Closure(int): void|null");
  assert.deepEqual(splitUnion("?string"), ["string", "null"]);
  assert.deepEqual(splitUnion("array<int|string, x>|null"), ["array<int|string, x>", "null"]);
});

test("optional vs required, kinds and deprecation of a prop", () => {
  const spec = parseComponent(`<?php
/**
 * @var string $a no default: required
 * @var ?string $b nullable: optional
 * @var string $c has a default [optional]
 * @var bool $d flag
 * @var int|float $e number
 * @var string $f @deprecated use a
 */
$c ??= 'x';
`);
  const by = Object.fromEntries(spec.props.map((p) => [p.name, p]));
  assert.deepEqual([by.a.required, by.b.required, by.c.required, by.d.required], [true, false, false, false], "a bool flag is never required");
  assert.deepEqual([by.d.kind, by.e.kind, by.a.kind], ["bool", "number", "string"]);
  assert.equal(by.f.deprecated, "use a");
});

test("a docblock without props is just a description; props from code are inferred", () => {
  const spec = parseComponent("<?php\n/** Just a note. */\n$size ??= 'md';\n");
  assert.equal(spec.description, "Just a note.");
  assert.deepEqual(spec.props.map((p) => [p.name, p.inferred, p.type, p.default]), [["size", true, null, "'md'"]]);
});

test("prop names are matched the way the engine camelCases them", () => {
  assert.equal(camel("has-label"), "hasLabel");
  assert.equal(camel("has_label"), "hasLabel");
  assert.equal(camel("hasLabel"), "hasLabel");
  assert.equal(camel("data-html"), "dataHtml");
});

test("odd input does not throw and big files are fast", () => {
  for (const s of ["", "/**", "/** @var */", "/** @var $x */", "$a ??= ", "/** @slot */", "<?php /** @var string|$x */ $x ??= ["]) assert.doesNotThrow(() => parseComponent(s), s);
  const big = "/** @var string $a The a */\n$a ??= 'x';\n".repeat(3000);
  const t = Date.now();
  assert.equal(parseComponent(big).props.length, 1);
  assert.ok(Date.now() - t < 1500, "3000 blocks parse quickly");
});
