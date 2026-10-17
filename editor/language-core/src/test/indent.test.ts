import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCast } from '../indent.js';

test('a multiline @php statement never waits for @endphp', () => {
  const output = formatCast('@php(\n  $docs = config(\n    "docs"\n  )\n)\n@props {\nstring $title;\n}\n@if ($docs)\n<nav></nav>\n@endif');
  assert.match(output, /    string \$title;/);
  assert.match(output, /    <nav><\/nav>/);
});

test('a single-line @php(...) statement is unaffected', () => {
  const output = formatCast('<div>\n@php($n = 5)\n<p>x</p>\n</div>');
  assert.equal(output, '<div>\n    @php($n = 5)\n    <p>x</p>\n</div>');
});
