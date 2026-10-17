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
