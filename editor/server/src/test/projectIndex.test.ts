import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectIndex } from '../index/projectIndex.js';
import { resolveSettings } from '../settings.js';

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-project-index-'));
  fs.mkdirSync(path.join(root, 'resources/views/components/btns'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'resources/views/components/button.cast.php'),
    `<?php
/**
 * Button component
 * @var string $variant Visual style, e.g. "primary", "secondary", "ghost"
 * @slot icon An optional leading icon
 */
$variant ??= 'primary';
`
  );
  fs.writeFileSync(path.join(root, 'resources/views/components/btns/add-new.cast.php'), '<div></div>');
  return root;
}

test('indexFile uses the shared parseComponent, not an ad-hoc regex, and keeps the richer docblock fields', () => {
  const root = fixtureRoot();
  const index = new ProjectIndex([root]);
  const meta = index.indexFile(root, path.join(root, 'resources/views/components/button.cast.php'), false)!;
  const variant = meta.props.get('variant')!;
  assert.deepEqual(variant.values, ['primary', 'secondary', 'ghost']);
  assert.equal(meta.slots.some((s) => s.name === 'icon'), true); // SlotSpec, not a bare string
});

test('ProjectIndex.resolveLegacyComponent/resolveView/resolveModule resolve against the configured settings', () => {
  const root = fixtureRoot();
  const index = new ProjectIndex([root]);
  // A non-default componentsPath, so this only passes if setSettings actually took effect - the default value
  // would resolve the same component dir either way and prove nothing.
  fs.mkdirSync(path.join(root, 'ui/btns'), { recursive: true });
  fs.renameSync(path.join(root, 'resources/views/components/btns/add-new.cast.php'), path.join(root, 'ui/btns/add-new.cast.php'));
  index.setSettings(resolveSettings({ componentsPath: ['ui'] }));
  const { file } = index.resolveLegacyComponent('btns.add-new');
  assert.ok(file && file.endsWith(path.join('ui', 'btns', 'add-new.cast.php')));
});

test('indexAll scans cast.componentsPath, not just the hardcoded resources/views/components default', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-project-index-custom-'));
  fs.mkdirSync(path.join(root, 'ui-components'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ui-components/card.cast.php'), '<?php /** Card component */ ?>');

  const index = new ProjectIndex([root]);
  index.setSettings(resolveSettings({ componentsPath: ['ui-components'] }));
  await index.indexAll();

  assert.ok(index.getComponent('Card'), 'a component in a custom componentsPath folder must still be indexed, under its own (not a views-root-relative) tag');
});
