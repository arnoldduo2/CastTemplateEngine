import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { CastParser } from '../parser/castParser.js';
import { VirtualPhpBuilder } from '../php/virtual.js';

describe('SourceMap and Virtual PHP', () => {
  const parser = new CastParser();
  const builder = new VirtualPhpBuilder();

  test('maps virtual echo hole positions back to Cast template positions', () => {
    const text = `<div class="container">
    <h1>@{ $user->name }</h1>
</div>`;

    const doc = parser.parse('file:///view.cast.php', text);
    const virtualDoc = builder.build(doc);

    assert.ok(virtualDoc.code.includes('$_cast_val = ($user->name);'));

    // Find position of $user in virtual document
    const lines = virtualDoc.code.split('\n');
    let vLine = -1;
    let vChar = -1;

    for (let i = 0; i < lines.length; i++) {
      const idx = lines[i].indexOf('$user->name');
      if (idx >= 0) {
        vLine = i;
        vChar = idx;
        break;
      }
    }

    assert.ok(vLine >= 0, 'Should find expression in virtual doc');

    // Translate back to Cast position
    const castPos = virtualDoc.sourceMap.toCastPosition({ line: vLine, character: vChar });
    assert.ok(castPos, 'Translation should succeed');
    assert.strictEqual(castPos.line, 1, 'Should map to line 1');
    assert.strictEqual(castPos.character, 11, 'Should map to start of $user->name in @{ $user->name }');
  });
});
