import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSettings, DEFAULT_SETTINGS } from '../settings.js';

test('resolveSettings fills in every default the extension itself uses', () => {
  assert.deepEqual(resolveSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(resolveSettings({ propCase: 'kebab' }), { ...DEFAULT_SETTINGS, propCase: 'kebab' });
});
