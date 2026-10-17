# Cast Language Intelligence Design

**Status:** Proposed — design approved in conversation; implementation plan pending review

## Goal

Make `*.cast.php` behave as a Cast template containing fully intelligent PHP, CSS, and JavaScript regions. The editor must underline invalid syntax before compilation, preserve native language hover/completion/navigation inside embedded regions, and supply Cast-specific help only where Cast syntax is selected.

## Current problem

The compiler, the TypeScript LSP, the VS Code extension scanners, TextMate grammar, and Tree-sitter grammar independently describe Cast syntax. Their behavior has diverged. The server advertises PHP-aware support but only locates a Phpactor PHAR; it does not start it or forward an LSP request. The extension separately creates virtual documents for a subset of embedded spans.

This creates duplicate formatting providers, incomplete source maps, false diagnostics, directive hover overreach, and inconsistent behavior between the editor and LSP.

## Scope

### Included

- A single Cast syntax-analysis model for server/editor intelligence.
- Persistent Phpactor LSP integration for PHP regions.
- Virtual CSS and JavaScript documents for `@css(...)`, `@script(...)`, and `@js(...)`.
- Source-mapped diagnostics, hover, completion, definition, references, rename, and signature help where each upstream provider supports them.
- One formatter/auto-indent implementation.
- Directive snippets and paired-delimiter completion.
- Regression coverage for the recorded `@props`, hover, and multiline `@php(...)` bugs.
- A coordinated regression plan for `antigravity-ide` editor-link handling in its owning packages.

### Excluded

- Replacing Phpactor with a different PHP server in this release. The adapter interface keeps that possible later.
- Implementing a CSS or JavaScript language server inside Cast. VS Code's installed providers remain the owners of their languages.
- Changing Cast runtime semantics beyond matching the existing PHP compiler.

## Validation model

Validation is not a whole-file PHP fallback. A valid Cast file is intentionally invalid raw PHP.

1. The Cast lexer identifies token boundaries and region kinds.
2. The Cast validator checks the envelope: directive words, balanced blocks, component/prop rules, placement rules, and malformed delimiters.
3. For each embedded region, the relevant language service validates generated valid code:
   - PHP: PHP tags, `@php ... @endphp`, `@php(...)`, `@{...}`, expression attributes, and directive arguments.
   - CSS: the body of `@css(...)`, with dynamic `@{...}` holes masked and independently checked as PHP.
   - JavaScript: the body of `@script(...)` and `@js(...)`, with dynamic `@{...}` holes masked and independently checked as PHP.
4. Every embedded diagnostic is translated through a multi-segment source map to the original Cast range.
5. A diagnostic is published with its original provider as `cast-php`, `cast-css`, `cast-javascript`, or `cast-engine`. A broken embedded-language span does not suppress independent Cast-envelope diagnostics.

This means invalid PHP inside `@if(...)` is a PHP diagnostic; an unmatched `@endif` is a Cast diagnostic; invalid CSS inside `@css(...)` is a CSS diagnostic. The editor underlines each at the source location without waiting for compilation.

## Architecture

```text
Cast source document
        |
        v
Cast analysis package
  - tokens / ranges / nesting
  - region classification
  - Cast diagnostics
  - formatting structural state
        |
        +--> Cast feature handlers (components, props, directives, snippets)
        +--> Virtual PHP builder + source map --> Phpactor adapter
        +--> Virtual CSS builder + source map --> VS Code CSS provider
        +--> Virtual JS builder + source map  --> VS Code JS provider
```

### Cast analysis package

Create a focused TypeScript package used by the LSP and VS Code extension. It owns source ranges for directives, directive names, paired block boundaries, `@props`, components, PHP spans, CSS spans, JS spans, and interpolation holes. Its behavior is tested against compiler fixtures.

The PHP compiler remains the runtime authority. The editor's directive inventory and validation rules must be generated from, or contract-tested against, `src/Directives.php` and the canonical `editor/spec/cast-syntax.json`; no feature may add a third handwritten directive list.

Tree-sitter may continue to provide syntax highlighting/folding for compatible hosts, but is not the LSP's source of semantic truth until it is wired into the runtime and passes the same fixture suite.

### PHP adapter

The Cast LSP starts one Phpactor child per workspace using the installed PHP runtime and bundled PHAR. The adapter owns its JSON-RPC lifecycle, workspace initialization, document synchronization, capability negotiation, and shutdown.

For every Cast document it maintains a virtual PHP document and a bidirectional source map. The generator preserves valid native PHP and represents Cast expressions/control flow as valid PHP. It hoists `@props` declarations as typed variables and retains mappings for each original span.

Requests inside PHP regions are delegated to Phpactor. Cast requests are handled locally. If both apply, Cast-specific results are merged only for the directive marker, component tag, or prop syntax; native PHP results win inside PHP expressions.

### CSS and JavaScript adapters

The VS Code client remains responsible for querying installed CSS and JavaScript providers against `cast-embedded:` virtual documents. The Cast LSP reports structural diagnostics and PHP diagnostics; the client maps CSS/JS hover, completion, definition, and diagnostics back to the source document. This preserves the user's configured CSS/JS tooling rather than duplicating it in the Cast server.

### Formatting and indentation

There must be one owner of indentation. The existing scanner in `editor/vscode/lib/indent.js` is richer than `editor/server/src/features/formatting.ts`; extract its structural logic into the shared analysis package and call it from both LSP formatting and extension auto-indent.

While this work is incomplete, the LSP must not advertise document formatting, preventing VS Code from selecting the simpler formatter. The shared scanner must distinguish:

- `@php` block form from `@php(...)`, including a multiline parenthesized statement;
- raw PHP, heredocs, comments, and PHP brace/alternative syntax;
- CSS and JavaScript parenthesis/brace nesting;
- raw HTML elements (`script`, `style`, `pre`, and `textarea`);
- Cast `@if`/`@else`/`@endif` and other paired directive blocks.

## User interaction behavior

### Hover

- A Cast directive description appears only when the cursor is in `DirectiveNode.nameRange` (`@if`, not its PHP condition).
- PHP/CSS/JS symbol hovers are delegated to their language provider.
- Hover markdown cannot force arbitrary foreground colours. Document colours are provided through TextMate scopes and themes.
- Examples use language fences the editor understands: `php`, `css`, or `javascript`, not an unregistered `cast` fence.

### Completion

The LSP provides explicit replacement ranges and snippets for `@php`, `@if`, `@foreach`, `@forelse`, `@for`, `@while`, `@switch`, `@props`, `@css`, `@script`, `@js`, and `@{}`. Block snippets insert matching closing directives and position the cursor inside the editable region.

PHP completion remains available in all PHP-classified spans, while CSS and JavaScript completion remain available in their respective blocks.

## Recorded regressions

1. **`@props` false positive:** replicate `Props::firstMarkupOffset` semantics; PHP tags, PHP strings, and PHP comments preceding `@props` are not markup.
2. **Directive hover collision:** add `nameRange` to directive nodes and inspect it instead of the directive's full argument range.
3. **Multiline `@php(...)`:** maintain parenthesis state across lines; a parenthesized statement must never enter `@endphp` raw-block mode.
4. **Editor URL scheme:** in `anode/error-handler`, map both `antigravity` and `antigravity-ide` preset names to `antigravity-ide://file/{file}:{line}:{column}`; in Cast Framework, resolve `CAST_EDITOR`, then `error-handler.editor`, then `vscode`. Release and test this separately because those packages are outside this repository.

## Acceptance criteria

- Invalid PHP in every PHP-classified Cast region receives a mapped red diagnostic before template compilation.
- Invalid CSS/JS in their respective block receives a mapped red diagnostic.
- Invalid Cast syntax receives a Cast diagnostic even when embedded code is valid.
- Valid PHP documentation before `@props` is not diagnosed as HTML markup.
- Hovering a function inside `@php(...)`, a directive argument, or an echo hole shows only the PHP-provider hover.
- Selecting `@php`, `@if`, `@for`, `@foreach`, `@css`, `@js`, or `@{` completion inserts valid paired syntax.
- Formatting `@php`, multiline `@php(...)`, `@props`, nested control directives, CSS, and JS is deterministic and idempotent.
- The source directive inventory has contract tests against the PHP compiler and editor syntax spec.
- The Tree-sitter grammar suite runs in CI, rather than depending on an undeclared global CLI.

## Risks and decisions

- Phpactor needs a real virtual document URI and stable workspace initialization. The adapter will use stable per-source virtual URIs and integration tests with a fake upstream LSP before enabling the real process in CI.
- PHPactor diagnostics may differ from compiler diagnostics. Both must be retained and labelled; editor diagnostics must not claim compile certainty where the compiler owns semantics.
- CSS/JS provider behavior varies by installed extension. The client must degrade gracefully and still retain Cast/PHP diagnostics.
- The editor-link fixes require version coordination with external packages and cannot be released solely from Cast Template Engine.
