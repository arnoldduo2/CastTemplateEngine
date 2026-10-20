import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSettings, DEFAULT_SETTINGS } from '../settings.js';

test('resolveSettings fills in every default the extension itself uses', () => {
  assert.deepEqual(resolveSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(resolveSettings({ propCase: 'kebab' }), { ...DEFAULT_SETTINGS, propCase: 'kebab' });
});

test('resolveSettings normalizes a bare string componentsPath into an array (cast.componentsPath is declared ["string", "array"] in package.json)', () => {
  assert.deepEqual(
    resolveSettings({ componentsPath: 'resources/views/ui' as unknown as string[] }),
    { ...DEFAULT_SETTINGS, componentsPath: ['resources/views/ui'] }
  );
});

test('resolveSettings falls back to the default propCase/diagnostics on an unrecognized value, instead of passing it through', () => {
  assert.deepEqual(
    resolveSettings({ propCase: 'shout' as unknown as 'camel', diagnostics: 'loud' as unknown as 'hint' }),
    DEFAULT_SETTINGS
  );
});
