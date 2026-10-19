import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { InsertTextFormat } from 'vscode-languageserver';
import { CastParser } from '../parser/castParser.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { CompletionProvider } from '../features/completion.js';
import { HoverProvider } from '../features/hover.js';
import { FormattingProvider } from '../features/formatting.js';

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
});

/** The {line, character} of the first occurrence of `word` in `text` - test-only convenience. */
function positionOfWord(text: string, word: string) {
  const offset = text.indexOf(word);
  const prefix = text.slice(0, offset);
  const lines = prefix.split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}
