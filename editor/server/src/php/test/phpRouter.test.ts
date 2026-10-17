import assert from 'node:assert/strict';
import test from 'node:test';
import { CastParser } from '../../parser/castParser.js';
import { PhpRouter, PhpDiagnosticClient } from '../phpRouter.js';

test('maps PHP diagnostics to a Cast echo hole', async () => {
  const parser = new CastParser();
  const document = parser.parse('file:///view.cast.php', '@{ $user->missing + }');
  const client: PhpDiagnosticClient = {
    async synchronize(virtual) {
      const expression = '$user->missing +';
      const start = virtual.text.indexOf(expression);
      return [{
        message: 'Unexpected token',
        severity: 1,
        range: { start: { line: 2, character: start - virtual.text.lastIndexOf('\n', start) - 1 }, end: { line: 2, character: start - virtual.text.lastIndexOf('\n', start) - 1 + expression.length } }
      }];
    }
  };
  const router = new PhpRouter(client);

  const diagnostics = await router.getDiagnostics(document);

  assert.equal(diagnostics[0].source, 'cast-php');
  assert.deepEqual(diagnostics[0].range, {
    start: { line: 0, character: 3 },
    end: { line: 0, character: 19 }
  });
});
