import { test, describe } from 'node:test';
import * as assert from 'node:assert';
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

  test('hover on directives returns syntax documentation', () => {
    const text = `@if ($active)\n    <span>Active</span>\n@endif`;
    const doc = parser.parse('file:///view.cast.php', text);
    const hover = hoverProvider.getHover(doc, { line: 0, character: 1 });

    assert.ok(hover, 'Should return hover for @if');
    const md = typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
    assert.ok(md.includes('Cast Directive: `@if`'));
  });

  test('formatting cleans up directive indentation', () => {
    const unformatted = `@if ($active)\n<p>Active</p>\n@else\n<p>Inactive</p>\n@endif`;
    const doc = parser.parse('file:///view.cast.php', unformatted);
    const edits = formattingProvider.format(doc, { tabSize: 4, insertSpaces: true });

    assert.ok(edits.length > 0, 'Should produce formatting edits');
    const result = edits[0].newText;
    assert.ok(result.includes('    <p>Active</p>'), 'Inner paragraph should be indented');
  });
});
