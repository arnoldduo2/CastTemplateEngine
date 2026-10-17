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
  index.setSettings(resolveSettings({ componentsPath: ['resources/views/components'] }));
  const { file } = index.resolveLegacyComponent('btns.add-new');
  assert.ok(file && file.endsWith('add-new.cast.php'));
});
