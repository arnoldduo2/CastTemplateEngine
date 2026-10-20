# Changelog

All notable changes are listed here. This project follows [Semantic Versioning](https://semver.org).

## 3.0.3

- **LSP/extension precedence**: the VS Code extension now defers entirely to `cast-language-server` for
  hover, go-to-definition, completion, document links, and diagnostics-with-quick-fixes once the LSP
  confirms a successful `State.Running` handshake, falling back to its own hand-rolled engine
  automatically whenever the LSP isn't installed, fails to start, or later stops - the two engines are
  never both active for the same capability at once.
- **`cast-language-core`**: a new shared TypeScript package (`editor/language-core/`) carrying the pure,
  host-independent logic both the LSP and the extension need - component docblock/`@props{}` parsing,
  component/legacy-view/module name resolution, directive and component-tag scanning, and completion-
  context detection - so the two no longer carry independently-maintained copies that can drift apart.
- **The LSP reaches full parity** with the extension's own engine:
  - Diagnostics: unknown/missing/deprecated props, invalid enum values, missing `key` on mapped tags,
    mixed `<?= ?>`/`@{ }` echo styles, and `@props{}`/legacy `??=` conflicts, each with the extension's
    own quick fixes, respecting `cast.diagnostics`.
  - Hover: builtins, the `@{ }` echo hole, fluent `.filter()/.map()` chains, component docs, legacy
    `Component()`/`view()`/`module()` references (with their resolved file and props, or "looked for"
    when unresolved).
  - Go to Definition: a prop's own declaration line (docblock `@var`/`@param` and legacy `??=`, not only
    `@props{}`), and legacy `Component()`/`view()`/`module()` references.
  - Document Links and slot/attribute/value completion, propCase-aware spelling, used-attribute dedup,
    and prop-kind-aware snippet insertion.
- **`cast.*` settings now reach the LSP**: `componentsPath` (including a `config/view.php` `'components'`
  override), `viewsPath`, `resourcesPath`, `extension`, `propCase`, and `diagnostics` are sent at startup
  and kept in sync over `workspace/didChangeConfiguration`.
- **New directives**:
  - `@children` - prints the content captured between a component's opening and closing tags, or the
    literal `empty content` when there was none.
  - `@includes(...)` - a new `Directives::FUNCTION_DIRECTIVES` entry (alongside `@route`/`@cast`/
    `@modules`/etc.), compiling to a call to a host-framework-supplied `__includes($view, $data)`.
- **Hardening**: every `cast-language-core` consumer in the VS Code extension (and the LSP client wiring
  itself) now degrades gracefully instead of crashing extension activation when the package - a locally
  staged, not-published-to-npm dependency - fails to install (offline, a locked file, a `--no-dependencies`
  VSIX).

## 2.1.2

- **Fix (Windows)**: the VS Code extension failed to start the language server with `spawn ...\npm\cast-language-server ENOENT`. `where` returns npm's extensionless sh shim first, which Node cannot spawn; the extension now launches the real `dist/server.js` beside the shim with `node`. Non-Windows behaviour is unchanged.

## 2.1.1

- **Fix (Windows)**: `engine:editor-install` failed with `Cannot find module ...\node_modules\npm\bin\npm-cli.js`. The installer now resolves `npm`/`npx` shims to their absolute `.cmd`/`.exe` path before running them, so language-server and extension dependency installs work.

## 2.1.0

- **Unified editor installer (`engine:editor-install` / `-update` / `-uninstall`)**: installs the VS Code
  extension AND the global `cast-language-server` in one command, with a requirements check (PHP, Node.js,
  npm, PHP extensions, PHPactor) printed up front.
  - `php cast engine:editor-install [all|extension|lsp]` — target just the extension, just the LSP server,
    or both (default).
  - Per-editor boolean flags (`--cursor`, `--vscode`, `--antigravity-ide`, ...) select one or more editors
    at once, instead of a single `--editor=name`; omitting them auto-detects, same as before.
  - `cast-language-server` is installed **globally** via `npm install -g`, so it's resolvable from any
    project afterward, not just the one it was built from.
  - Missing PHPactor (`editor/server/bin/phpactor.phar`) now prompts to download a pinned,
    checksum-verified release automatically (`--yes`/`-y` to auto-confirm, `--no-phpactor` to skip) —
    it's optional; the server and extension work fully without it, only PHP-aware bridging is disabled.
  - `--dry-run` prints the full plan (requirements, targets, commands) without changing anything.
  - The original `engine:editor install|update|uninstall` command is unchanged and still works standalone.
- **VS Code extension now actually launches the language server**: `extension.js` gained real
  `vscode-languageclient` wiring (previously only in the README, not the code) behind
  `cast.languageServer.enable`/`cast.languageServer.path`, resolving `cast-language-server` on PATH and
  starting it over stdio. Missing the client library or the server binary degrades to a one-time
  informational toast — every existing hand-rolled provider (hover, completion, definition, formatting,
  diagnostics) keeps working unchanged either way.

## 2.0.0

- **Dedicated Cast Language Server (`cast-language-server`, TypeScript)**:
  - High-performance, out-of-process Language Server Protocol (LSP) implementation in `editor/server/`.
  - In-process AST parser (`CastParser`) providing sub-millisecond diagnostics for syntax, unclosed/mismatched tags, and unbalanced directives.
  - Unified project indexer (`ProjectIndex`) indexing user views, components, and framework-owned views (`starter/`, demo views, error pages), with priority user overrides and `extends::` inheritance resolution.
  - Contextual completions for directives, component tags with auto-filled required prop snippets, slot tags, attributes with typed defaults, and `extends::` paths.
  - Rich hover documentation for components, prop types/defaults, slot tags, and directives.
  - Go to Definition for components, slots, and `extends::` inheritance targets.
  - Document formatting and on-type indentation rules.
  - Virtual PHP document generator and bidirectional character-accurate source mapping (`SourceMap`, `VirtualPhpBuilder`) with Phpactor integration and missing runtime detection.
- **Standalone `tree-sitter-cast` Grammar**:
  - Independent Tree-sitter grammar in `editor/tree-sitter-cast/` with 100% test corpus pass.
  - Standard queries for syntax highlights (`highlights.scm`), embedded language injections (`injections.scm`), code folding (`folds.scm`), and indentation (`indents.scm`).
  - Supports modern editors and tools including VS Code, Antigravity IDE, Neovim (`nvim-treesitter`), Zed, and Helix.
- **Strict-Typed `@props` Directive & Component Inheritance**:
  - New syntax: `@props { type $name [ = default ]; }` and `@props extends::Components.BaseCard { ... }`.
  - Semicolon-terminated entries with cycle detection on inheritance chains.
  - Compile-time type checking with supported types: `string`, `int`, `float`, `bool`, `array`, `object`, `iterable`, `callable`, `mixed`, nullable `?Type`, and union `TypeA|TypeB`.
  - Enforced placement before any HTML markup in component views.
- **CLI AST Tooling & AI Agent Specification**:
  - `php cast lint <file> --json` (and `engine:check --json`): Outputs structured JSON diagnostics for LSP and AI agent automation.
  - `php cast engine:ast <file>` (alias `ast`): Machine-readable AST inspection displaying declared props, component invocations, echo holes, and scoped CSS classes.
  - `bin/gen-syntax-spec.php` & `editor/spec/cast-syntax.json`: Reflection-driven machine-readable syntax specification with automated drift tests.

- **VS Code Extension Language Intelligence & Virtual Documents Bridge**:
  - Bridged `@css(...)`, `@script(...)`, `@js(...)`, and `@{ ... }` echo holes to VS Code's native PHP, JS, and CSS language providers via virtual documents (`cast-embedded:` URI scheme).
  - Parameter-name inlay hints (`EmbeddedInlayHints`) for functional directives (`@route(...)`, `@htchars(...)`, etc.), matching native PHP function calls.
  - Hover documentation (`FunctionDirectiveHovers` & `EmbeddedHovers`) bridging directly to real PHP docblocks and function signatures.
  - Go to Definition (`EmbeddedDefinitions`): Ctrl+click / F12 now resolves variables and symbols inside `@{ }` echo holes, including loop/callback variables in `@map`/`@filter`/`@foreach`.
  - Completions (`EmbeddedCompletions`) for CSS properties, JS APIs, and PHP expressions inside directive bodies and echo holes.
  - Dedicated TextMate scope `keyword.control.directive.styled.cast` with configuration defaults for styled directives and bracket punctuation coloring.
  - Added `arender` snippet alias for `@render(...)`.
  - Indentation engine re-indents doc comments (`/** ... */`) correctly within `@script(...)` and `@css(...)` blocks.
- **Scoped CSS & Component Root Class Injection**:
  - `Css::scanClassRenames()` and `Compiler`: Component `@css(...)` declarations scan class selectors and uniquely scope matching class names in template markup.
  - `Css::injectScope()` and `Assets::pushScope()` / `popScope()`: Component rendered root elements automatically receive their scoped `cast-<id>` class, ensuring component scoped CSS reliably targets rendered markup.
  - Pure class selector optimization: Flattened scoped selectors with fallback to ancestor scoping for dynamically assembled classes.
- **Engine Compiler & Runtime Improvements**:
  - Directives: Supported `@render(...)` as the standard inline markup render helper (aliasing `return(...)`), with accurate line number mapping across nested callbacks.
  - Short-echo tags in bare HTML attributes: Safely quotes short-echo PHP tags in bare attributes (e.g. `attr=@route(...)`) to prevent space-splitting and preserve HTML tag integrity. Added validation for missing `{` in braced attributes.
  - Windows file locking & cache resilience: Atomic temporary cache file replacement with retry loop and fallback on Windows systems where file locking (`rename()`) can be transiently held by concurrent `include()` calls. Second-granularity cache mtime check (`<=`).
  - Runtime event delegation (`assets/cast.js`): Safely merges `Cast` onto existing `window.Cast` instances without overwriting host SPA runtime APIs.
  - `TemplateError`: Captures and exposes `$file` and `$line` properties directly.

## 1.6.0

- **Editor hover for functional directives**: `@map(...)`, `@filter(...)`, the inline-render transform (`return(...)`/`@cast(...)`), the `@{ ... }` echo hole, and every segment of a fluent collection chain (`@$items.filter(...).map(...)`) now show hover documentation explaining accepted parameters and behavior.
- **Directive bracket highlighting**: every directive's parentheses (`@if(...)`, `@foreach(...)`, `@map(...)`, `@css(...)`, `@script(...)`, etc.) are now colored/bolded the same as their keyword, matching how Laravel Blade styles `@if(...)`/`@foreach(...)`.
- **`engine:editor uninstall` actually uninstalls**: previously it parsed the `uninstall` action but always (re)installed instead; it now removes the installed extension directory.
- **`engine:check` can resolve component tags**: it previously never passed a components directory to the compiler, so every `<Tag />` reference in any project would falsely report "not found"; it now follows the same `{views}/components` convention as `engine:compile`.
- **`CAST_HOME` environment variable**: checked before `USERPROFILE`/`HOME` when installing the editor extension, for setups that keep a separate tool home.
- **PHP/JS docblock parity**: `src/Support/ComponentDocs.php` is a PHP port of the editor extension's component-docblock reader (`editor/vscode/lib/docblock.js`), proven identical against shared fixtures in `tests/fixtures/components/`.
- **Starter kit**: `starter/resources/views/` — a small example app (layout, components, pages) demonstrating the engine's conventions end-to-end.
- Fixed a stale `v1.0.2` in the CLI's `--help` banner (now reads the real version).
- Added a CI job that runs the editor extension's own test suite.

## 1.5.1

- **Editor Native Highlighting for Directives**:
  - `@css(...)`: Embedded `source.css` for native CSS language intelligence, selector highlighting, properties, units, and color previews, while continuing to support dynamic `@{ ... }` PHP variable holes and nested CSS parentheses (`calc(...)`, `rgba(...)`, etc.).
  - `@script(...)` & `@js(...)`: Embedded `source.js` for native JavaScript language intelligence.
  - Expressions & `@map(...)` Callbacks: Added HTML tag (`<tag ...>`, `</tag>`) and `@{ ... }` echo recognition inside callback expressions so template markup displays full HTML syntax highlighting instead of PHP comparison (`<`, `>`) and arithmetic operators.
- **Editor Snippets Everywhere**:
  - Registered snippets for both `php` and `html` language modes in `package.json`.
  - Updated snippet scopes to `php,html` so snippets like `acss`, `amap`, `aforeach`, `ccomp`, etc. autocomplete anywhere in `.cast.php` view files.
- **Antigravity IDE & Multi-Editor Support**:
  - Enhanced `php cast engine:editor` CLI command with `--editor` support (`--editor=antigravity-ide`, `--editor=code`, etc.).
  - Added auto-detection to install extensions directly to Antigravity IDE (`.antigravity-ide/extensions`), VS Code (`.vscode/extensions`), and other supported editors.

## 1.5.0

Stable release for CastTemplateEngine.

- **Reactive Client Scripts**: `@script(...)` and `@js(...)` allow components to define client-side behavior without separate JS files. Includes zero-dependency `assets/cast.js` runtime with delegated event listener `handleEvent(event, selector, handler)` and `Cast.on(...)`, `Cast.update(...)` for in-place DOM updates, `Cast.refresh(...)` for fragment swaps, and `@scripts` layout directive.
- **Scoped Component Styles**: `@css(...)` encapsulates styles per component with automatic selector scoping and translates PHP `@{ ... }` expressions into dynamic CSS custom properties (`var(--cast-<id>-<n>)`). Rendered via `@styles`.
- **Component Asset Bundler**: Auto-discovery of dedicated component stylesheets and scripts in `resources/css/components/` and `resources/js/components/`. Zero-dependency minification and marker-based bundling via `php cast engine:build`.
- **Collection Shorthands**: Added `@map(...)`, `@filter(...)`, chained collection mapping (`@$items.filter(...).map(...)`), and automatic `data-el-key` attributes with diagnostic warnings.
- **CLI Commands Suite**: Built-in CLI runner `php cast engine:<command>` for template linting (`check`), precompilation (`compile`), asset bundling (`build`), cache clearing (`clear`), snippets cheat sheet (`snippets`), and VS Code extension installation (`editor install`).
- **VS Code Extension & Snippets**: Updated grammar, syntax highlighting, hover documentation, and comprehensive snippet triggers.

## 1.1.0

- **The `@` shorthand for PHP**: `@{ $x }` for `<?= $x ?>`, and `@for`, `@foreach`, `@forelse` / `@empty`, `@while`, `@if` / `@elseif` / `@else`, `@unless`, `@isset`, `@switch` / `@case` / `@default`, `@break`, `@continue`, `@php` ... `@endphp`, each with its `@end...`. `@@` is a literal `@`. See the README. Plain PHP and everything written before keeps working; `<?php ?>` blocks, `<style>` rules like `@media`, and e-mail addresses are left alone. Line numbers are kept. Mistakes are reported with the template and line.

## 1.0.3

- **Errors point at your template.** An error inside a template used to be reported in the compiled copy (`storage/framework/views/<hash>.php`), so error pages and logs named a file nobody wrote. The exception's file, line, message and every trace frame now name the template (or component) and its line. A helper that rejects its argument (`htchars(null)`) is reported at the line of the template that called it.
- Fix: moving a leading `declare(strict_types=1)` to the front of the compiled file no longer shifts the line numbers of the template.

## 1.0.2

- Fix: a view or component that starts with `<?php declare(strict_types=1);` stopped PHP with "strict_types declaration must be the very first statement", because the engine puts a line of its own before every compiled file. The declare is now moved to the front of the compiled file.

## 1.0.1

- The Composer package is now `anode/cast-template-engine` (was `arnoldduo2/cast-template-engine`). No code changes.

## 1.0.0

First release.

- `CastTemplate` class: `new CastTemplate($componentsDir, '.cast.php', $options)` and `render()`.
- Component tags with name resolution (`kpi-card`, `kpi_card`, `KpiCard`, `kpiCard`), folders with dots.
- Props: strings, `{expression}`, boolean attributes, `{...$spread}`, camelCased keys.
- Children, `<Slot name="...">`, and component tags inside `{ }` expressions.
- Escaped `attr={expression}` on plain HTML tags.
- Compiled-template cache, compile errors with file and line.
