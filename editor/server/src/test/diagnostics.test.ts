import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CastParser } from '../parser/castParser.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { DiagnosticsManager } from '../diagnostics/diagnostics.js';
import { CodeActionsManager } from '../codeActions/codeActions.js';
import { DEFAULT_SETTINGS } from '../settings.js';

const parser = new CastParser();
const codeActions = new CodeActionsManager();

/** Indexes a single Card component (required title, enum variant, a deprecated prop, a deprecated component
 * variant via a second file) and parses `viewSource` against it. */
function setup(componentSource: string, viewSource: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-diagnostics-'));
  const componentsDir = path.join(root, 'resources/views/components');
  fs.mkdirSync(componentsDir, { recursive: true });
  const componentPath = path.join(componentsDir, 'card.cast.php');
  fs.writeFileSync(componentPath, componentSource);
  const index = new ProjectIndex([root]);
  index.indexFile(componentsDir, componentPath, false); // baseDir = components folder, so the tag is "Card"
  const manager = new DiagnosticsManager(index);
  const doc = parser.parse('file:///view.cast.php', viewSource);
  return { manager, doc };
}

const CARD = `<?php
/**
 * Card component
 * @var string $title The card's heading
 * @var string $variant Visual style, e.g. "primary", "secondary", "ghost"
 * @var string $oldProp Deprecated: use variant instead
 */
`;

const DEPRECATED_CARD = `<?php
/**
 * Card component
 * @deprecated use NewCard instead
 * @var string $title The card's heading
 */
`;

test('diagnostics: "off" silences every LSP-computed diagnostic, not just parser errors', () => {
  const { manager, doc } = setup(CARD, '<Card />');
  const diagnostics = manager.getFastDiagnostics(doc, { ...DEFAULT_SETTINGS, diagnostics: 'off' });
  assert.deepEqual(diagnostics, []);
});

test('unknown prop name gets a suggestion and a quick fix that renames it', () => {
  const { manager, doc } = setup(CARD, '<Card title="x" varient="primary" />');
  const diagnostics = manager.getFastDiagnostics(doc, DEFAULT_SETTINGS);
  const d = diagnostics.find((d) => d.code === 'unknown-prop')!;
  assert.ok(d, 'expected an unknown-prop diagnostic');
  assert.match(d.message, /did you mean/i);
  assert.equal(d.fix![0].newText, 'variant');
});

test('invalid enum value gets one quick fix per allowed value', () => {
  const { manager, doc } = setup(CARD, '<Card title="x" variant="loud" />');
  const diagnostics = manager.getFastDiagnostics(doc, DEFAULT_SETTINGS);
  const d = diagnostics.find((d) => d.code === 'invalid-value')!;
  assert.ok(d, 'expected an invalid-value diagnostic');
  assert.equal(d.fix!.length, 3); // primary, secondary, ghost
});

test('CodeActionsManager offers a fix for a diagnostic getFastDiagnostics computed, not just one CastParser already had', () => {
  const { manager, doc } = setup(CARD, '<Card />');
  const diagnostics = manager.getFastDiagnostics(doc, DEFAULT_SETTINGS);
  const missing = diagnostics.find((d) => d.code === 'missing-prop')!;
  assert.ok(missing, 'expected a missing-prop diagnostic (title is required)');
  const actions = codeActions.getCodeActions(doc, { textDocument: { uri: doc.uri }, range: missing.range, context: { diagnostics: [] } }, diagnostics);
  assert.ok(actions.length > 0);
});

test('deprecated component gets flagged with its own message', () => {
  const { manager, doc } = setup(DEPRECATED_CARD, '<Card title="x" />');
  const diagnostics = manager.getFastDiagnostics(doc, DEFAULT_SETTINGS);
  const d = diagnostics.find((d) => d.code === 'deprecated-component')!;
  assert.ok(d, 'expected a deprecated-component diagnostic');
  assert.match(d.message, /use NewCard instead/);
});

test('deprecated prop gets flagged with its own message', () => {
  const { manager, doc } = setup(CARD, '<Card title="x" oldProp="y" />');
  const diagnostics = manager.getFastDiagnostics(doc, DEFAULT_SETTINGS);
  const d = diagnostics.find((d) => d.code === 'deprecated-prop')!;
  assert.ok(d, 'expected a deprecated-prop diagnostic');
  assert.match(d.message, /use variant instead/);
});

test('missing key on a mapped tag is flagged', () => {
  const { manager, doc } = setup(CARD, "@map($items, ($item, $i) => return(<li>@{ $item->name }</li>))");
  const diagnostics = manager.getFastDiagnostics(doc, DEFAULT_SETTINGS);
  const d = diagnostics.find((d) => d.code === 'missing-key')!;
  assert.ok(d, 'expected a missing-key diagnostic');
});

test('mixing <?= ?> and @{ } across sibling leaf tags is flagged', () => {
  const { manager, doc } = setup(CARD, '<td><?= $a ?></td><td>@{ $b }</td><td>@{ $c }</td>');
  const diagnostics = manager.getFastDiagnostics(doc, DEFAULT_SETTINGS);
  const d = diagnostics.find((d) => d.code === 'mixed-echo-style')!;
  assert.ok(d, 'expected a mixed-echo-style diagnostic on the minority-style sibling');
});

test('a @props{} entry that still has a legacy ??= line for the same name is flagged', () => {
  const { manager, doc } = setup(CARD, '@props { string $title; }\n<?php $title ??= "x"; ?>');
  const diagnostics = manager.getFastDiagnostics(doc, DEFAULT_SETTINGS);
  const d = diagnostics.find((d) => d.code === 'props-legacy-conflict')!;
  assert.ok(d, 'expected a props-legacy-conflict diagnostic');
});
