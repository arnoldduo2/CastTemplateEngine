import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { CastParser } from '../parser/castParser.js';

describe('CastParser', () => {
  const parser = new CastParser();

  test('parses @props block with strict types, defaults, and extends', () => {
    const text = `@props extends::Components.Cards.BaseCard {
    string $title;
    ?int $count = 0;
    mixed $extra;
}

<div class="card">
    <h1>@{ $title }</h1>
</div>`;

    const doc = parser.parse('file:///test.cast.php', text);

    assert.ok(doc.propsBlock, 'Props block should be parsed');
    assert.strictEqual(doc.propsBlock.extendsTarget, 'Components.Cards.BaseCard');
    assert.strictEqual(doc.propsBlock.entries.length, 3);

    const titleProp = doc.propsBlock.entries[0];
    assert.strictEqual(titleProp.name, 'title');
    assert.strictEqual(titleProp.type, 'string');
    assert.strictEqual(titleProp.isRequired, true);
    assert.strictEqual(titleProp.defaultValue, undefined);

    const countProp = doc.propsBlock.entries[1];
    assert.strictEqual(countProp.name, 'count');
    assert.strictEqual(countProp.type, '?int');
    assert.strictEqual(countProp.isNullable, true);
    assert.strictEqual(countProp.defaultValue, '0');

    assert.strictEqual(doc.echoHoles.length, 1);
    assert.strictEqual(doc.echoHoles[0].expression, '$title');
    assert.strictEqual(doc.diagnostics.length, 0);
  });

  test('detects unclosed component tags', () => {
    const text = `<Cards.Header title="Sales">
    <p>Body</p>`;

    const doc = parser.parse('file:///unclosed.cast.php', text);
    assert.ok(doc.diagnostics.length > 0, 'Should have diagnostic for unclosed tag');
    assert.ok(doc.diagnostics[0].message.includes('never closed'));
  });

  test('detects mismatched directives', () => {
    const text = `@if ($condition)
    <p>True</p>
@endforeach`;

    const doc = parser.parse('file:///mismatched.cast.php', text);
    assert.ok(doc.diagnostics.length > 0, 'Should have diagnostic for mismatched directive');
    assert.ok(doc.diagnostics[0].message.includes('Mismatched directive'));
  });

  test('parses components and attributes', () => {
    const text = `<Button variant="primary" count={$total} active {...$rest} />`;
    const doc = parser.parse('file:///comp.cast.php', text);

    assert.strictEqual(doc.components.length, 1);
    const comp = doc.components[0];
    assert.strictEqual(comp.name, 'Button');
    assert.strictEqual(comp.isSelfClosing, true);
    assert.strictEqual(comp.attributes.length, 4);

    assert.strictEqual(comp.attributes[0].name, 'variant');
    assert.strictEqual(comp.attributes[0].value, 'primary');

    assert.strictEqual(comp.attributes[1].name, 'count');
    assert.strictEqual(comp.attributes[1].value, '$total');
    assert.strictEqual(comp.attributes[1].isExpression, true);

    assert.strictEqual(comp.attributes[2].name, 'active');
    assert.strictEqual(comp.attributes[2].isBoolean, true);

    assert.strictEqual(comp.attributes[3].isSpread, true);
    assert.strictEqual(comp.attributes[3].value, '$rest');
  });

  test('does not treat PHP docblock markup as markup before @props', () => {
    const doc = parser.parse(
      'file:///card.cast.php',
      '<?php /** Renders <Card /> and <a> */ ?>\n@props { string $title; }'
    );

    assert.strictEqual(
      doc.diagnostics.some((diagnostic) => diagnostic.message.includes('before any HTML')),
      false
    );
  });

  test('tracks only the directive marker in nameRange', () => {
    const doc = parser.parse('file:///view.cast.php', '@php(testFunction($x))');
    const directive = doc.directives[0] as unknown as { nameRange?: { start: { line: number; character: number }; end: { line: number; character: number } } };

    assert.deepStrictEqual(directive.nameRange, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 4 }
    });
  });
});
