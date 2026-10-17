import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCast, buildEmbeddedVirtuals, buildPhpVirtual } from '../index.js';

test('maps PHP ranges from directive arguments and @php bodies', () => {
  const text = '@if ($missing + )\n@php\n$x = ;\n@endphp\n@endif';
  const doc = buildPhpVirtual('file:///view.cast.php', analyzeCast(text));

  assert.deepEqual(doc.map.toSourceRange(doc.phpRanges[0]), {
    start: text.indexOf('$missing + '),
    end: text.indexOf('$missing + ') + '$missing + '.length,
    text: '$missing + '
  });
  assert.deepEqual(doc.map.toSourceRange(doc.phpRanges[1]), {
    start: text.indexOf('$x = ;'),
    end: text.indexOf('$x = ;') + '$x = ;'.length,
    text: '$x = ;'
  });
});

test('masks CSS interpolation and retains a PHP child region', () => {
  const docs = buildEmbeddedVirtuals(
    'file:///view.cast.php',
    analyzeCast('@css(.a { color: @{ $colour + }; })')
  );

  assert.equal(docs.css[0].text.includes('@{'), false);
  assert.equal(docs.php.length, 1);
});
