import assert from 'node:assert/strict';
import test from 'node:test';
import { CastParser } from '../parser/castParser.js';
import { PhpDelegation, PhpLanguageClient } from '../features/phpDelegation.js';

test('delegates hover inside a directive argument but not on its marker', async () => {
  const document = new CastParser().parse('file:///view.cast.php', '@php(testFunction($value))');
  const client: PhpLanguageClient = {
    async synchronize() {},
    async request<T>(method: string, params: unknown): Promise<T | null> {
      assert.equal(method, 'textDocument/hover');
      assert.equal((params as { textDocument: { uri: string } }).textDocument.uri, 'file:///view.cast.php.cast-php');
      return {
        contents: { kind: 'markdown', value: 'PHP function' },
        range: { start: { line: 2, character: 15 }, end: { line: 2, character: 27 } }
      } as T;
    }
  };
  const delegation = new PhpDelegation(client);

  const delegated = await delegation.hover(document, { line: 0, character: 6 });
  const marker = await delegation.hover(document, { line: 0, character: 1 });

  assert.equal((delegated?.contents as { value: string }).value, 'PHP function');
  assert.equal(marker, null);
});

test('a completion edit that cannot be mapped back to source is dropped, not left pointing at the virtual document', async () => {
  const document = new CastParser().parse('file:///view.cast.php', '@php(testFunction($value))');
  const client: PhpLanguageClient = {
    async synchronize() {},
    async request<T>(): Promise<T | null> {
      return [{
        label: 'bad',
        // this range falls inside buildPhpVirtual's generated "<?php\ndeclare(strict_types=1);\n" preamble, which
        // has no source mapping at all - exactly the case a real Phpactor "insert a use statement at the top of
        // the file" edit would hit.
        textEdit: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: 'use Foo;\n' },
        insertText: 'bad',
      }] as unknown as T;
    },
  };
  const delegation = new PhpDelegation(client);

  const items = await delegation.completion(document, { line: 0, character: 6 });

  assert.ok(Array.isArray(items));
  assert.equal((items as unknown[])[0] && (items![0] as { textEdit?: unknown }).textEdit, undefined, 'the unmappable edit is dropped, not left at virtual coordinates');
  assert.equal((items![0] as { insertText?: string }).insertText, 'bad', 'insertText survives as a safe fallback');
});

test('a definition whose range cannot be mapped back to source is dropped, not left pointing at the virtual document', async () => {
  const document = new CastParser().parse('file:///view.cast.php', '@php(testFunction($value))');
  const client: PhpLanguageClient = {
    async synchronize() {},
    async request<T>(): Promise<T | null> {
      return {
        uri: 'file:///view.cast.php.cast-php',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      } as unknown as T;
    },
  };
  const delegation = new PhpDelegation(client);

  const result = await delegation.definition(document, { line: 0, character: 6 });

  assert.equal(result, null, 'an unmappable location is dropped rather than returned pointing at the virtual document');
});
