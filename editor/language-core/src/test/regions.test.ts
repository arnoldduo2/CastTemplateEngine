import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCast } from '../index.js';

test('classifies non-overlapping embedded language regions', () => {
  const result = analyzeCast('@if ($ok)\n@php($x = 1)\n@css(.a { color: @{ $x }; })\n@js(console.log(1))\n@endif');

  assert.deepEqual(result.regions.map((region) => region.kind), ['php', 'php', 'css', 'php', 'javascript']);
  assert.equal(result.directives[0].nameRange.text, '@if');
});
