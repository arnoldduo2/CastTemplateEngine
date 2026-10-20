import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CompletionItemKind, InsertTextFormat, Location, Range, TextEdit } from 'vscode-languageserver';
import { CastParser } from '../parser/castParser.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { CompletionProvider } from '../features/completion.js';
import { HoverProvider } from '../features/hover.js';
import { DefinitionProvider } from '../features/definition.js';
import { DocumentLinksProvider } from '../features/documentLinks.js';
import { FormattingProvider } from '../features/formatting.js';
import { DEFAULT_SETTINGS } from '../settings.js';

describe('Language Server Features', () => {
  const parser = new CastParser();
  const index = new ProjectIndex();
  const completionProvider = new CompletionProvider(index);
  const hoverProvider = new HoverProvider(index);
  const formattingProvider = new FormattingProvider();

  test('directive completions trigger on @', () => {
    const text = `<div class="main">\n    @`;
    const doc = parser.parse('file:///view.cast.php', text);
    const items = completionProvider.getCompletions(doc, { line: 1, character: 5 });

    assert.ok(items.length > 0, 'Should return directive completions');
    const labels = items.map(i => i.label);
    assert.ok(labels.includes('@if'), 'Should include @if');
    assert.ok(labels.includes('@foreach'), 'Should include @foreach');
    assert.ok(labels.includes('@props'), 'Should include @props');
  });

  test('directive completions carry an explicit replacement edit for the typed @ prefix, plus @js and @{}', () => {
    const text = '<div>\n    @ph';
    const doc = parser.parse('file:///view.cast.php', text);
    const items = completionProvider.getCompletions(doc, { line: 1, character: 7 });

    const php = items.find(i => i.label === '@php');
    assert.ok(php?.textEdit && 'newText' in php.textEdit, '@php completion should carry an explicit replacement edit');
    assert.equal((php!.textEdit as { newText: string }).newText, '@php\n\t$0\n@endphp');
    assert.deepEqual((php!.textEdit as { range: unknown }).range, { start: { line: 1, character: 4 }, end: { line: 1, character: 7 } });

    const js = items.find(i => i.label === '@js');
    assert.ok(js, 'should offer an @js completion alongside @css and @script');
    assert.equal(js!.insertTextFormat, InsertTextFormat.Snippet);

    const hole = items.find(i => i.label === '@{}');
    assert.ok(hole, 'should offer an @{} echo-hole completion');
    assert.equal((hole!.textEdit as { newText: string }).newText, '@{ ${1:expression} }');
  });

  test('hover on directives returns syntax documentation', () => {
    const text = `@if ($active)\n    <span>Active</span>\n@endif`;
    const doc = parser.parse('file:///view.cast.php', text);
    const hover = hoverProvider.getHover(doc, { line: 0, character: 1 });

    assert.ok(hover, 'Should return hover for @if');
    const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
    assert.ok(md.includes('Cast Directive: `@if`'));
  });

  test('directive hover uses a markdown fence the editor understands, never an unregistered "cast" fence', () => {
    const text = `@if ($active)\n    <span>Active</span>\n@endif`;
    const doc = parser.parse('file:///view.cast.php', text);
    const hover = hoverProvider.getHover(doc, { line: 0, character: 1 });

    assert.ok(hover, 'Should return hover for @if');
    const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
    assert.ok(!md.includes('```cast'), 'must not use the unregistered cast fence');
    assert.ok(md.includes('```php'), 'should fall back to a registered fence (php) for directive syntax');
  });

  test('formatting cleans up directive indentation', () => {
    const unformatted = `@if ($active)\n<p>Active</p>\n@else\n<p>Inactive</p>\n@endif`;
    const doc = parser.parse('file:///view.cast.php', unformatted);
    const edits = formattingProvider.format(doc, { tabSize: 4, insertSpaces: true });

    assert.ok(edits.length > 0, 'Should produce formatting edits');
    const result = edits[0].newText;
    assert.ok(result.includes('    <p>Active</p>'), 'Inner paragraph should be indented');
  });

  test('formatting indents nested HTML tags and leaves <script> body content untouched, the same shared scanner the extension uses', () => {
    const unformatted = '<div>\n<script>\n  let a = 1;\n      if (a) { a++ }\n</script>\n</div>';
    const doc = parser.parse('file:///view.cast.php', unformatted);
    const edits = formattingProvider.format(doc, { tabSize: 4, insertSpaces: true });

    assert.ok(edits.length > 0, 'Should produce formatting edits');
    const result = edits[0].newText;
    assert.ok(result.includes('    <script>'), '<script> is indented as a child of <div>');
    assert.ok(result.includes('  let a = 1;'), 'original interior indentation inside <script> is preserved verbatim');
    assert.ok(result.includes('      if (a) { a++ }'), 'original interior indentation inside <script> is preserved verbatim');
  });

  test('hover on a builtin like handleEvent returns the shared markdown', () => {
    const doc = parser.parse('file:///view.cast.php', '@script(handleEvent("click", ".btn", () => {}))');
    const hover = hoverProvider.getHover(doc, positionOfWord(doc.text, 'handleEvent'));
    assert.ok(hover, 'Should return hover for handleEvent');
    const md = typeof hover!.contents === 'object' && 'value' in hover!.contents ? hover!.contents.value : '';
    assert.match(md, /Registers a delegated event listener/);
  });

  test('hover on @{ immediately followed by { explains the echo hole', () => {
    const doc = parser.parse('file:///view.cast.php', '<p>@{ $x }</p>');
    const hover = hoverProvider.getHover(doc, { line: 0, character: 4 });
    assert.ok(hover, 'Should return hover for the echo hole');
    const md = typeof hover!.contents === 'object' && 'value' in hover!.contents ? hover!.contents.value : '';
    assert.match(md, /echo hole/);
  });

  test('hover on a fluent .map() in a chain explains the chain, not a generic directive', () => {
    const doc = parser.parse('file:///view.cast.php', '<p>@$items.filter(($i) => $i.active).map(($i) => $i.name)</p>');
    const hover = hoverProvider.getHover(doc, positionOfWord(doc.text, 'map'));
    assert.ok(hover, 'Should return hover for the chained .map()');
    const md = typeof hover!.contents === 'object' && 'value' in hover!.contents ? hover!.contents.value : '';
    assert.match(md, /fluent chain/);
  });

  test('hover on an unresolved component tag says what was looked for, same as the extension\'s own generic reference hover', () => {
    const { index: rooted } = referenceFixture();
    const hoverProvider = new HoverProvider(rooted);
    const doc = parser.parse('file:///view.cast.php', '<Missing.Thing />');
    const hover = hoverProvider.getHover(doc, positionOfWord(doc.text, 'Missing.Thing'))!;
    assert.ok(hover, 'should return a hover for the unresolved tag');
    const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
    assert.match(md, /No file found\. Looked for:/);
  });

  test('hover on a legacy Component() reference resolves and lists the target file\'s props', () => {
    const { index: rooted } = referenceFixture();
    const hoverProvider = new HoverProvider(rooted);
    const doc = parser.parse('file:///view.cast.php', "<?= Component('btns.add-new') ?>");
    const hover = hoverProvider.getHover(doc, positionOfWord(doc.text, 'btns.add-new'))!;
    assert.ok(hover, 'should return a hover for the resolved legacy reference');
    const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
    assert.match(md, /\*\*Component \(legacy\)\*\* `btns\.add-new`/);
    assert.match(md, /Ctrl\+click to open\./);
  });

  test('go-to-definition on a component attribute jumps to its declaration line, not the component file start', () => {
    const { index: rooted } = referenceFixture();
    const definitionProvider = new DefinitionProvider(rooted);
    const doc = parser.parse('file:///view.cast.php', '<Button variant="primary" />');
    const def = definitionProvider.getDefinition(doc, positionOfWord(doc.text, 'variant'))!;
    assert.notDeepEqual((def as Location).range, Range.create(0, 0, 0, 0));
  });

  test('go-to-definition on a docblock/??=-declared prop (no @props{} entry, so no tracked range) still jumps to its declaration line', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-features-docblock-prop-'));
    const componentsDir = path.join(root, 'resources/views/components');
    fs.mkdirSync(componentsDir, { recursive: true });
    const source = `<?php\n/**\n * Button component\n * @var string $variant Visual style\n */\n$variant ??= 'primary';\n`;
    fs.writeFileSync(path.join(componentsDir, 'Button.cast.php'), source);
    const index = new ProjectIndex([root]);
    index.indexFile(componentsDir, path.join(componentsDir, 'Button.cast.php'), false);

    const definitionProvider = new DefinitionProvider(index);
    const doc = parser.parse('file:///view.cast.php', '<Button variant="primary" />');
    const def = definitionProvider.getDefinition(doc, positionOfWord(doc.text, 'variant')) as Location;
    assert.ok(def, 'should still find a definition for a docblock-declared prop');
    assert.equal(def.range.start.line, source.split('\n').findIndex((l) => l.includes('@var')));
  });

  test('go-to-definition resolves a legacy Component() call', () => {
    const { index: rooted } = referenceFixture();
    const definitionProvider = new DefinitionProvider(rooted);
    const doc = parser.parse('file:///view.cast.php', "<?= Component('btns.add-new') ?>");
    const def = definitionProvider.getDefinition(doc, positionOfWord(doc.text, 'btns.add-new'));
    assert.ok(def);
  });

  test('document links include a legacy Component()/view()/module reference, same as a component tag', () => {
    const { index: rooted } = referenceFixture();
    const documentLinksProvider = new DocumentLinksProvider(rooted);
    const doc = parser.parse('file:///view.cast.php', "<?php __includes('layouts.header'); ?>");
    const links = documentLinksProvider.getDocumentLinks(doc);
    assert.equal(links.length, 1);
  });

  test('slot completion inside a known parent component lists only its declared slots, with descriptions', () => {
    const { index: rooted } = completionFixture();
    const provider = new CompletionProvider(rooted);
    const text = '<Card><Slot name="" /></Card>';
    const doc = parser.parse('file:///view.cast.php', text);
    const offset = text.indexOf('name="') + 'name="'.length;
    const items = provider.getCompletions(doc, { line: 0, character: offset });
    assert.deepEqual(items.map(i => i.label), ['icon', 'title']);
  });

  test('attribute completion skips an attribute already written on the tag', () => {
    const { index: rooted } = completionFixture();
    const provider = new CompletionProvider(rooted);
    const text = '<Button variant="primary" ';
    const doc = parser.parse('file:///view.cast.php', text);
    const items = provider.getCompletions(doc, { line: 0, character: text.length });
    assert.equal(items.some(i => i.label === 'variant'), false);
  });

  test('attribute completion spells the name per cast.propCase and snippets by prop kind', () => {
    const { index: rooted } = completionFixture();
    const provider = new CompletionProvider(rooted);
    provider.setSettings({ ...DEFAULT_SETTINGS, propCase: 'kebab' });
    const text = '<Button ';
    const doc = parser.parse('file:///view.cast.php', text);
    const items = provider.getCompletions(doc, { line: 0, character: text.length });
    const item = items.find(i => i.label === 'has-label')!;
    assert.ok(item, 'should offer the bool prop spelled as kebab-case');
    assert.match((item.textEdit as TextEdit).newText, /^has-label$/); // bool prop: no value placeholder
  });

  test('tag completion snippets a required non-string prop as an expression placeholder, not a quoted string literal', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-features-completion-kind-'));
    const componentsDir = path.join(root, 'resources/views/components');
    fs.mkdirSync(componentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(componentsDir, 'Items.cast.php'),
      `<?php\n/**\n * Items component\n * @var array $items The list, required\n */\n`
    );
    const index = new ProjectIndex([root]);
    index.indexFile(componentsDir, path.join(componentsDir, 'Items.cast.php'), false);

    const provider = new CompletionProvider(index);
    const text = '<Item';
    const doc = parser.parse('file:///view.cast.php', text);
    const items = provider.getCompletions(doc, { line: 0, character: text.length });
    const item = items.find((i) => i.label === 'Items')!;
    assert.ok(item, 'should offer the Items component tag');
    const newText = (item.textEdit as TextEdit).newText;
    assert.match(newText, /items=\{\$\{1:items\}\}/, 'a required array prop must use a {expression} placeholder, not a quoted string');
    assert.doesNotMatch(newText, /items="/);
  });

  test("value completion inside an attribute offers the prop's declared enum values", () => {
    const { index: rooted } = completionFixture();
    const provider = new CompletionProvider(rooted);
    const text = '<Button variant="" />';
    const doc = parser.parse('file:///view.cast.php', text);
    const offset = text.indexOf('variant="') + 'variant="'.length;
    const items = provider.getCompletions(doc, { line: 0, character: offset });
    assert.deepEqual(items.map(i => i.label), ['primary', 'secondary', 'ghost']);
    assert.ok(items.every(i => i.kind === CompletionItemKind.EnumMember));
  });
});

/** A temp project with a Button component (required+enum prop, for attribute-definition and completion tests),
 * a legacy btns/add-new.cast.php component, and a layouts/header.cast.php view (for Task 7's reference tests). */
function referenceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-features-refs-'));
  const componentsDir = path.join(root, 'resources/views/components');
  fs.mkdirSync(path.join(componentsDir, 'btns'), { recursive: true });
  fs.writeFileSync(
    path.join(componentsDir, 'Button.cast.php'),
    // @props{} (not a docblock @var) so the prop has a real source range CastParser tracks (parseComponent's
    // own pure text analysis has no position tracking - see Task 4's ruling) - needed for the attribute ->
    // declaration-line jump this fixture exists for.
    `<?php\n@props {\n    string $variant = 'primary';\n}\n`
  );
  fs.writeFileSync(path.join(componentsDir, 'btns/add-new.cast.php'), '<a></a>');
  const viewsDir = path.join(root, 'resources/views');
  fs.mkdirSync(path.join(viewsDir, 'layouts'), { recursive: true });
  fs.writeFileSync(path.join(viewsDir, 'layouts/header.cast.php'), '<header></header>');

  const index = new ProjectIndex([root]);
  index.indexFile(componentsDir, path.join(componentsDir, 'Button.cast.php'), false);
  return { root, index };
}

/** A temp project with a Card component (declared slots `icon`/`title`, for slot completion) and a Button
 * component (an enum `variant` prop and a bool `hasLabel` prop, for attribute/value/propCase completion). */
function completionFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-features-completion-'));
  const componentsDir = path.join(root, 'resources/views/components');
  fs.mkdirSync(componentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(componentsDir, 'Card.cast.php'),
    `<?php\n/**\n * Card component\n * @slot icon Icon shown before the title\n * @slot title Heading content\n */\n`
  );
  fs.writeFileSync(
    path.join(componentsDir, 'Button.cast.php'),
    `<?php\n/**\n * Button component\n * @var string $variant Visual style, e.g. "primary", "secondary", "ghost"\n * @var bool $hasLabel Whether to render the visible label\n */\n`
  );

  const index = new ProjectIndex([root]);
  index.indexFile(componentsDir, path.join(componentsDir, 'Card.cast.php'), false);
  index.indexFile(componentsDir, path.join(componentsDir, 'Button.cast.php'), false);
  return { root, index };
}

/** The {line, character} of the first occurrence of `word` in `text` - test-only convenience. */
function positionOfWord(text: string, word: string) {
  const offset = text.indexOf(word);
  const prefix = text.slice(0, offset);
  const lines = prefix.split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}
