import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseComponent, camel, spell } from '../index.js';

test('matches the legacy lib/docblock.js output on every tests/fixtures/components case', () => {
  const dir = path.join(__dirname, '../../../../tests/fixtures/components');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.cast.php'))) {
    const expected = JSON.parse(fs.readFileSync(path.join(dir, file.replace('.cast.php', '.expected.json')), 'utf8'));
    assert.deepEqual(parseComponent(fs.readFileSync(path.join(dir, file), 'utf8')), expected);
  }
});

test('camel/spell match the existing engine camelCasing rules', () => {
  assert.equal(camel('has-label'), 'hasLabel');
  assert.equal(spell('hasLabel', 'kebab'), 'has-label');
  assert.equal(spell('hasLabel', 'snake'), 'has_label');
});
