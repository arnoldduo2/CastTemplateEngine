# Cast Language Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver source-mapped, pre-compilation Cast, PHP, CSS, and JavaScript diagnostics plus native language intelligence for .cast.php files.

**Architecture:** A reusable language-core package classifies Cast and embedded-language regions. The LSP validates Cast structure and brokers PHP requests to a persistent Phpactor child using virtual PHP documents. The VS Code extension forwards CSS and JavaScript regions to installed providers using the same region model. One shared indentation engine replaces competing formatters.

**Tech Stack:** PHP 8.1+, TypeScript 5.7, Node 18+, vscode-languageserver, vscode-jsonrpc, Phpactor, VS Code language APIs, Tree-sitter CLI.

**Spec:** docs/superpowers/specs/2026-10-17-cast-language-intelligence-design.md

## Global Constraints

- Keep src/Directives.php and src/Props.php as runtime authorities; editor validation must match them.
- Never lint a whole Cast file as raw PHP; lint only source-mapped PHP regions.
- Use cast-php, cast-css, cast-javascript, and cast-engine as diagnostic sources.
- Directive help is legal only over its @name range, never embedded arguments or body code.
- Until the shared formatter ships, the LSP must not advertise formatting.
- Support Windows and POSIX Phpactor process invocation.
- CSS/JS provider integration stays in the VS Code client and uses the developer's installed tools.

## Review Focus

- A multiline @php( statement that ends with ) must never enter @endphp raw mode.
- A PHP docblock with HTML-looking documentation before @props is not markup.
- PHP errors in an @css interpolation and CSS errors around it map independently.
- PHP hover inside @if(...) or @php(...) never includes Cast directive documentation.
- Both the globally installed server and copied extension can load language-core.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| editor/language-core/ | Canonical scanner, region types, source maps, virtual documents, indentation. |
| editor/server/src/php/phpactorClient.ts | Persistent Phpactor JSON-RPC lifecycle. |
| editor/server/src/php/phpRouter.ts | PHP request routing and source mapping. |
| editor/server/src/diagnostics/embeddedDiagnostics.ts | Mapped PHP diagnostics merged with Cast diagnostics. |
| editor/vscode/lib/embedded.js | CSS/JS provider adapter using language-core ranges. |
| editor/vscode/lib/indent.js | Compatibility facade over language-core indentation. |
| editor/spec/cast-syntax.json | Public directive metadata contract-checked against compiler rules. |
| .github/workflows/tests.yml | Node package and Tree-sitter CI coverage. |

### Task 1: Create language-core and the scanner contract

**Files:**
- Create: editor/language-core/package.json
- Create: editor/language-core/tsconfig.json
- Create: editor/language-core/src/types.ts
- Create: editor/language-core/src/regions.ts
- Create: editor/language-core/src/index.ts
- Create: editor/language-core/src/test/regions.test.ts
- Modify: editor/server/package.json and package-lock.json
- Modify: editor/vscode/package.json and package-lock.json

**Interfaces:**
- analyzeCast(text: string): CastAnalysis
- Region has kind, range, and optional directive owner.
- DirectiveNode has name, nameRange, range, and optional argsRange.

- [ ] **Step 1: Write failing region-classification tests**

~~~
test('classifies non-overlapping embedded language regions', () => {
  const result = analyzeCast('@if ($ok)\n@php($x = 1)\n@css(.a { color: @{ $x }; })\n@js(console.log(1))\n@endif');
  assert.deepEqual(result.regions.map(region => region.kind), ['php', 'php', 'css', 'php', 'javascript']);
  assert.equal(result.directives[0].nameRange.text, '@if');
});
~~~

- [ ] **Step 2: Verify failure**

Run: npm --prefix editor/language-core test

Expected: failure because language-core and analyzeCast do not exist.

- [ ] **Step 3: Implement typed public API**

~~~
export interface OffsetRange { start: number; end: number; }
export interface DirectiveNode {
  name: string;
  nameRange: OffsetRange;
  range: OffsetRange;
  argsRange?: OffsetRange;
}
export interface CastAnalysis {
  directives: DirectiveNode[];
  regions: Region[];
  diagnostics: CoreDiagnostic[];
}
export function analyzeCast(text: string): CastAnalysis { /* scanner */ }
~~~

Compile CommonJS with declarations so the CJS extension can require the package and the NodeNext server can import it.

- [ ] **Step 4: Implement scanner rules from engine syntax**

Read src/Directives.php, src/Props.php, and editor/spec/cast-syntax.json. Use quote, comment, and paren-aware scanning. Distinguish bare @php from @php(...); classify echo holes, expression attributes, directive arguments, CSS/JS bodies, and nested PHP interpolation. Emit nameRange for only @ plus directive name.

- [ ] **Step 5: Make both consumers depend on language-core**

Add a local file dependency and bundle it in the server package. Task 8 stages the dependency inside copied extensions.

- [ ] **Step 6: Verify and commit**

Run: npm --prefix editor/language-core test; npm --prefix editor/server run build; npm --prefix editor/server test

~~~
git add editor/language-core editor/server/package.json editor/server/package-lock.json editor/vscode/package.json editor/vscode/package-lock.json
git commit -m "feat(editor): add shared Cast language core"
~~~

### Task 2: Align Cast diagnostics with the PHP engine

**Files:**
- Create: editor/language-core/src/castDiagnostics.ts
- Create: editor/language-core/src/test/castDiagnostics.test.ts
- Modify: editor/server/src/parser/ast.ts
- Modify: editor/server/src/parser/castParser.ts
- Modify: editor/server/src/diagnostics/diagnostics.ts
- Modify: editor/server/src/test/parser.test.ts

**Interfaces:**
- getCastDiagnostics(analysis: CastAnalysis): CoreDiagnostic[]
- Every LSP DirectiveNode has mandatory nameRange.

- [ ] **Step 1: Add failing regressions**

~~~
test('PHP docblock markup does not precede @props markup', () => {
  const doc = parser.parse('file:///card.cast.php', '<?php /** Renders <Card /> and <a> */ ?>\n@props { string $title; }');
  assert.equal(doc.diagnostics.some(d => d.message.includes('before any HTML')), false);
});

test('directive nameRange excludes arguments', () => {
  const doc = parser.parse('file:///view.cast.php', '@php(testFunction($x))');
  assert.deepEqual(doc.directives[0].nameRange, rangeOf('@php'));
});
~~~

- [ ] **Step 2: Run the parser test**

Run: npm --prefix editor/server run build; node --test editor/server/dist/test/parser.test.js

Expected: the current parser falsely sees docblock tags and lacks nameRange.

- [ ] **Step 3: Match Props::firstMarkupOffset**

Move its quote and PHP-tag skipping rules into language-core. Report @props placement at the first real markup tag. Remove the raw prefix HTML regex in castParser.ts.

- [ ] **Step 4: Adapt the compatibility AST**

Populate directive ranges, args, props, components, and diagnostics from language-core. Keep CastDocument until all feature providers consume CastAnalysis directly.

- [ ] **Step 5: Verify and commit**

Run: npm --prefix editor/language-core test; npm --prefix editor/server run build; npm --prefix editor/server test

~~~
git add editor/language-core editor/server/src/parser editor/server/src/diagnostics editor/server/src/test
git commit -m "fix(lsp): align Cast diagnostics with engine syntax"
~~~

### Task 3: Build source maps and virtual language documents

**Files:**
- Create: editor/language-core/src/sourceMap.ts
- Create: editor/language-core/src/virtualPhp.ts
- Create: editor/language-core/src/virtualEmbedded.ts
- Create: editor/language-core/src/test/virtualDocuments.test.ts
- Modify: editor/server/src/php/sourceMap.ts
- Modify: editor/server/src/php/virtual.ts
- Modify: editor/server/src/test/sourceMap.test.ts

**Interfaces:**
- VirtualDocument has uri, languageId, text, and map.
- SourceMap maps to source ranges and returns null for generated-only text.
- buildPhpVirtual(uri, analysis) returns a mapped PHP view.

- [ ] **Step 1: Write source-map failures**

~~~
test('maps PHP ranges from directive arguments and @php bodies', () => {
  const doc = buildPhpVirtual('file:///view.cast.php', analyzeCast('@if ($missing + )\n@php\n$x = ;\n@endphp\n@endif'));
  assert.deepEqual(doc.map.toSourceRange(doc.phpRanges[0]), rangeOf('$missing + '));
  assert.deepEqual(doc.map.toSourceRange(doc.phpRanges[1]), rangeOf('$x = ;'));
});

test('masks CSS interpolation and retains a PHP child region', () => {
  const docs = buildEmbeddedVirtuals('file:///view.cast.php', analyzeCast('@css(.a { color: @{ $colour + }; })'));
  assert.equal(docs.css[0].text.includes('@{'), false);
  assert.equal(docs.php.length, 1);
});
~~~

- [ ] **Step 2: Implement ordered map segments**

~~~
export interface SourceMapSegment {
  source: OffsetRange | null;
  virtual: OffsetRange;
  generated: boolean;
}
export class SourceMap {
  add(segment: SourceMapSegment): void;
  toSourceOffset(offset: number): number | null;
  toSourceRange(range: OffsetRange): OffsetRange | null;
}
~~~

Generated PHP delimiters and hoisted declarations must not map to arbitrary source text.

- [ ] **Step 3: Generate valid PHP**

Include native PHP, both @php forms, echo holes, expression attributes, directive arguments, and control-flow directives. Hoist @props as documented typed variables. Store one map segment for every original PHP span.

- [ ] **Step 4: Generate CSS/JS virtual text**

Copy each body with original line shape. Replace nested PHP holes with same-length whitespace in CSS/JS and emit each hole separately as PHP.

- [ ] **Step 5: Verify and commit**

Run: npm --prefix editor/language-core test; npm --prefix editor/server run build; npm --prefix editor/server test

~~~
git add editor/language-core editor/server/src/php editor/server/src/test/sourceMap.test.ts
git commit -m "feat(lsp): add source-mapped Cast virtual documents"
~~~

### Task 4: Start Phpactor and publish mapped PHP diagnostics

**Files:**
- Create: editor/server/src/php/phpactorClient.ts
- Create: editor/server/src/php/phpRouter.ts
- Create: editor/server/src/php/test/fakePhpactor.ts
- Create: editor/server/src/php/test/phpRouter.test.ts
- Modify: editor/server/package.json and package-lock.json
- Modify: editor/server/src/php/engine.ts
- Modify: editor/server/src/diagnostics/diagnostics.ts
- Modify: editor/server/src/server.ts

**Interfaces:**
- PhpactorClient.start(workspaceFolders): Promise of server capabilities.
- PhpactorClient.open(virtual) and change(virtual) synchronize virtual documents.
- PhpRouter.getDiagnostics(document) returns mapped LSP diagnostics.

- [ ] **Step 1: Add fake-upstream coverage**

~~~
test('maps Phpactor diagnostics to a Cast echo hole', async () => {
  const fake = await startFakePhpactor({ message: 'Unexpected token', range: virtualRange('$user->missing +') });
  const router = await PhpRouter.connect(fake.command);
  const diagnostics = await router.getDiagnostics(castDocument('@{ $user->missing + }'));
  assert.equal(diagnostics[0].source, 'cast-php');
  assert.deepEqual(diagnostics[0].range, sourceRange('$user->missing +'));
});
~~~

- [ ] **Step 2: Implement JSON-RPC lifecycle**

Declare vscode-jsonrpc directly. Spawn PHP, PHAR, and language-server. Connect child streams with StreamMessageReader, StreamMessageWriter, and createMessageConnection. Send initialize, initialized, didOpen, didChange, shutdown, and exit in protocol order.

- [ ] **Step 3: Make readiness explicit**

Extend PhpEngineResolution with executable command and startup error state. If Phpactor is absent or cannot initialize, keep Cast diagnostics active and show one actionable notice; do not report PHP intelligence as available.

- [ ] **Step 4: Merge mapped PHP diagnostics**

On source changes update virtual PHP, map upstream diagnostics back through SourceMap, preserve code/tags/data, and merge with fast Cast diagnostics. Drop diagnostics in generated-only ranges.

- [ ] **Step 5: Verify and commit**

Run: npm --prefix editor/server run build; npm --prefix editor/server test

~~~
git add editor/server/package.json editor/server/package-lock.json editor/server/src/php editor/server/src/diagnostics editor/server/src/server.ts
git commit -m "feat(lsp): proxy mapped PHP diagnostics through Phpactor"
~~~

### Task 5: Delegate PHP hover, completion, definition, and signature help

**Files:**
- Create: editor/server/src/features/phpDelegation.ts
- Create: editor/server/src/test/phpDelegation.test.ts
- Modify: editor/server/src/features/hover.ts
- Modify: editor/server/src/features/completion.ts
- Modify: editor/server/src/features/definition.ts
- Modify: editor/server/src/server.ts

**Interfaces:**
- PhpDelegation.targetAt(document, position) returns a virtual target only in a PHP region.
- mapHover, mapCompletion, mapDefinition, and mapSignatureHelp return source-document results.
- HoverProvider checks directive.nameRange only.

- [ ] **Step 1: Add hover-routing failure**

~~~
test('only the @php marker gets Cast documentation', async () => {
  assert.match(hoverAt('@php(testFunction())', positionOf('@php')).contents.value, /Cast Directive/);
  assert.deepEqual(await delegatedHoverAt('@php(testFunction())', positionOf('testFunction')), phpactorHover);
});
~~~

- [ ] **Step 2: Route by region kind**

At PHP positions call Phpactor before local Cast providers. At directive markers, components, and props call local providers. Do not merge Cast documentation into a PHP symbol hover.

- [ ] **Step 3: Translate feature payloads**

Map Hover ranges, CompletionItem text edits, Location, LocationLink, and SignatureHelp position data. Keep external definition URIs unchanged.

- [ ] **Step 4: Verify and commit**

Run: npm --prefix editor/server run build; npm --prefix editor/server test

~~~
git add editor/server/src/features editor/server/src/server.ts editor/server/src/test
git commit -m "feat(lsp): delegate embedded PHP intelligence"
~~~

### Task 6: Make indentation single-owner and fix multiline @php(...)

**Files:**
- Create: editor/language-core/src/indent.ts
- Create: editor/language-core/src/test/indent.test.ts
- Modify: editor/vscode/lib/indent.js
- Modify: editor/vscode/test/indent.test.js
- Modify: editor/server/src/features/formatting.ts
- Modify: editor/server/src/server.ts
- Modify: editor/server/src/test/features.test.ts

**Interfaces:**
- formatCast(text, options): string
- indentFor(lines, line, options): string or null
- Extension indent.js re-exports compiled core functions.

- [ ] **Step 1: Add multiline parenthesized @php regression**

~~~
test('a multiline @php statement never waits for @endphp', () => {
  const output = formatText('@php(\n  $docs = config(\n    "docs"\n  )\n)\n@props {\nstring $title;\n}\n@if ($docs)\n<nav></nav>\n@endif');
  assert.match(output, /    string \$title;/);
  assert.match(output, /    <nav><\/nav>/);
});
~~~

- [ ] **Step 2: Confirm the current failure**

Run: npm --prefix editor/vscode test -- --test-name-pattern="multiline @php statement"

Expected: later @props and @if lines remain untouched after raw mode starts.

- [ ] **Step 3: Move structural state to core**

When @php is followed by (, push a php-call frame with paren depth and scan until matching ). Only bare @php opens a frame closed by @endphp. Preserve raw PHP, heredocs, comments, HTML raw elements, CSS, JS, and Cast branches.

- [ ] **Step 4: Remove duplicate LSP formatter**

Set documentFormattingProvider false until the server calls formatCast. Then replace the trim-based FormattingProvider loop with formatCast and re-enable the capability.

- [ ] **Step 5: Verify parity and commit**

Run: npm --prefix editor/language-core test; npm --prefix editor/vscode test; npm --prefix editor/server run build; npm --prefix editor/server test

~~~
git add editor/language-core editor/vscode/lib/indent.js editor/vscode/test/indent.test.js editor/server/src/features/formatting.ts editor/server/src/server.ts editor/server/src/test/features.test.ts
git commit -m "fix(editor): unify Cast indentation and multiline php calls"
~~~

### Task 7: Complete snippets and CSS/JS provider integration

**Files:**
- Modify: editor/server/src/features/completion.ts
- Modify: editor/server/src/test/features.test.ts
- Modify: editor/server/src/features/hover.ts
- Modify: editor/vscode/lib/embedded.js
- Modify: editor/vscode/extension.js
- Modify: editor/vscode/test/embedded.test.js
- Modify: editor/vscode/test/extension.test.js

**Interfaces:**
- Directive completions carry explicit replacement edits.
- EmbeddedDiagnostics.refresh(document) maps CSS/JS provider diagnostics into one extension collection.
- embeddedTarget consumes language-core regions.

- [ ] **Step 1: Add completion failures**

~~~
test('directive completion inserts correct paired forms', () => {
  assert.equal(completion('@ph').find(item => item.label === '@php').textEdit.newText, '@php\n\tcursor\n@endsection'.replace('@endsection', '@endphp'));
  assert.equal(completion('@j').find(item => item.label === '@js').insertTextFormat, InsertTextFormat.Snippet);
  assert.equal(completion('@').find(item => item.label === '@{}').textEdit.newText, '@{ expression }');
});
~~~

- [ ] **Step 2: Implement explicit edits and missing forms**

Add @js and @{} alongside existing blocks. Replace the typed @identifier range when applying snippets. Every block gets its actual matching closing directive.

- [ ] **Step 3: Reuse language-core in extension bridge**

Replace findEchoHoles, findDirectiveArguments, findEmbeddedBlocks, and directive constants with wrappers around analyzeCast. Derive scopesAt from analyzed directive nesting.

- [ ] **Step 4: Publish embedded CSS/JS diagnostics**

Query vscode.executeDiagnosticProvider when present. Map ranges through language-core and publish cast-css or cast-javascript. Independently retain PHP diagnostics for nested interpolation. If unavailable, retain hover/completion without claiming validation succeeded.

- [ ] **Step 5: Correct hover rendering**

Use php, css, or javascript Markdown fences. Keep visual directive styling in TextMate grammar scopes; do not attempt unsupported hover foreground colours.

- [ ] **Step 6: Verify and commit**

Run: npm --prefix editor/server run build; npm --prefix editor/server test; npm --prefix editor/vscode test

~~~
git add editor/server/src/features editor/server/src/test editor/vscode/lib/embedded.js editor/vscode/extension.js editor/vscode/test editor/vscode/syntaxes
git commit -m "feat(editor): add mapped embedded language intelligence"
~~~

### Task 8: Package language-core and enforce all editor suites in CI

**Files:**
- Modify: src/Console/Commands/EngineEditorInstallCommand.php
- Modify: src/Console/Support/RequirementsChecker.php
- Modify: editor/server/package.json
- Modify: editor/vscode/package.json
- Modify: editor/tree-sitter-cast/package.json
- Modify: .github/workflows/tests.yml
- Modify: editor/vscode/test/mock-vscode.js

**Interfaces:**
- Installer stages language-core inside extension node_modules before dependency installation.
- CI runs language-core, server, extension, and Tree-sitter tests.

- [ ] **Step 1: Add package smoke coverage**

~~~
test('packaged language core exports analyzeCast', () => {
  const core = require('cast-language-core');
  assert.equal(typeof core.analyzeCast, 'function');
});
~~~

- [ ] **Step 2: Stage the core in copied extensions**

Extend EngineEditorInstallCommand::syncLanguageClientDeps to copy editor/language-core into extension node_modules before npm runs. Add a temporary-directory installer test asserting its package.json is staged.

- [ ] **Step 3: Repair the extension mock and Tree-sitter test path**

Add globalState.get and globalState.update to mock-vscode.js. Add package-local Tree-sitter CLI installation with npm ci and run its test command in CI.

- [ ] **Step 4: Add CI jobs**

Use Node 20 package-local install, build, and tests for language-core and server; install/test VS Code; install/test Tree-sitter; preserve the PHP matrix.

- [ ] **Step 5: Run release-equivalent checks and commit**

Run: npm --prefix editor/language-core ci; npm --prefix editor/language-core test; npm --prefix editor/server ci; npm --prefix editor/server run build; npm --prefix editor/server test; npm --prefix editor/vscode ci; npm --prefix editor/vscode test; npm --prefix editor/tree-sitter-cast ci; npm --prefix editor/tree-sitter-cast test

~~~
git add src/Console/Commands/EngineEditorInstallCommand.php src/Console/Support/RequirementsChecker.php editor .github/workflows/tests.yml
git commit -m "build(editor): package language core and test grammar tooling"
~~~

### Task 9: Release editor-link regressions from their owning packages

**Files:**
- Modify in anode/error-handler: src/Editor.php and URL-resolution tests.
- Modify in anode/cast-framework: src/Support/DevError.php and developer-error payload tests.

**Interfaces:**
- antigravity and antigravity-ide resolve to antigravity-ide://file/{file}:{line}:{column}.
- DevError precedence is CAST_EDITOR, then error-handler.editor, then vscode.

- [ ] **Step 1: Add alias tests**

~~~
public function testAntigravityAliasesUseTheInteractiveIdeProtocol(): void
{
    self::assertSame('antigravity-ide://file/C:/app/view.cast.php:8:3', Editor::url('antigravity', 'C:/app/view.cast.php', 8, 3));
    self::assertSame('antigravity-ide://file/C:/app/view.cast.php:8:3', Editor::url('antigravity-ide', 'C:/app/view.cast.php', 8, 3));
}
~~~

- [ ] **Step 2: Register aliases**

~~~
'antigravity' => 'antigravity-ide://file/{file}:{line}:{column}',
'antigravity-ide' => 'antigravity-ide://file/{file}:{line}:{column}',
~~~

- [ ] **Step 3: Add config precedence test and implementation**

~~~
public function testDevErrorUsesConfiguredEditorWhenEnvironmentIsUnset(): void
{
    Config::set('error-handler.editor', 'antigravity-ide');
    putenv('CAST_EDITOR');
    self::assertSame('antigravity-ide', DevError::capture($app)['editor']);
}

$editor = (string) (Env::get('CAST_EDITOR') ?: (Config::get('error-handler.editor') ?: 'vscode'));
~~~

- [ ] **Step 4: Verify and release**

Run focused PHP suites in both owning repositories, commit there, release compatible package versions, then update application lockfiles.

## Plan Self-Review

### Spec coverage

- Shared syntax and compiler conformance: Tasks 1–2.
- Mapped PHP/CSS/JS documents and diagnostics: Tasks 3–4 and 7.
- Full PHP intelligence: Task 5.
- Single formatter and multiline @php repair: Task 6.
- Completion and hover presentation: Task 7.
- Installer and grammar CI: Task 8.
- Editor URL regressions: Task 9.

### Type consistency

CastAnalysis, Region, DirectiveNode, SourceMap, VirtualDocument, PhpactorClient, and PhpRouter are introduced before consumers. Mapping applies only to virtual Cast documents; external locations retain their original URI.

### Review-focus coverage

The five review-focus cases are covered by Tasks 6, 2, 3/7, 5, and 8 respectively.

