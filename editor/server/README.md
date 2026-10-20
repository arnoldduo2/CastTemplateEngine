# Cast Language Server (`cast-language-server`)

High-performance, out-of-process Language Server Protocol (LSP) server for Cast templates (`*.cast.php`).

## Overview

`cast-language-server` provides rich language intelligence for Cast templates, at parity with (and, once
installed and running, preferred over) the VS Code extension's own hand-rolled engine — see "Precedence"
below:

- **Diagnostics**: Fast AST parsing with real-time detection of unclosed or mismatched tags, unbalanced control directives (`@if`, `@foreach`, `@switch`), `@props` syntax errors, unknown/missing/deprecated component props, invalid enum values, missing `key` on mapped tags, mixed echo styles, and `@props{}`/legacy `??=` conflicts, each with quick fixes.
- **Strict-Typed `@props`**: Type validation, required vs optional props checking, and component inheritance resolution (`@props extends::...`).
- **Autocompletion**:
  - Directives (`@if`, `@foreach`, `@props`, etc.)
  - Component tags with auto-filled required prop snippets
  - Slots (`<Slot name="...">`), listing a parent component's actual declared slots
  - Attribute names (propCase-aware spelling, deduped against attributes already on the tag) with type-aware defaults
  - Attribute values for an enum/bool prop
  - `extends::` inheritance component paths
- **Hover**: Rich Markdown hover cards for components, prop types/defaults, slot declarations, directives, builtins, and legacy `Component()`/`view()`/`module()` references (with the resolved file and props, or the paths it looked for when unresolved).
- **Go to Definition**: F12 / Ctrl+click navigation to component files, a prop's own declaration line (docblock or `@props{}`), slot definitions, inheritance targets, and legacy `Component()`/`view()`/`module()` references.
- **Document Links**: the same set of references as Go to Definition, as clickable links.
- **Formatting**: Full-document indentation and on-type line formatting.
- **Embedded PHP Bridge**: Bidirectional character-accurate source maps (`SourceMap`, `VirtualPhpBuilder`) to bridge echo holes `@{ ... }` and directives to Phpactor or other PHP language servers.
- **Settings**: `cast.componentsPath` (including a `config/view.php` `'components'` override), `cast.viewsPath`, `cast.resourcesPath`, `cast.extension`, `cast.propCase`, and `cast.diagnostics` are read from the client at startup (`initializationOptions`) and kept in sync over `workspace/didChangeConfiguration`.

## Precedence

When the VS Code extension's own hand-rolled engine is also installed, the extension defers to this
server for hover, Go to Definition, completion, Document Links, and diagnostics-with-quick-fixes once its
client confirms a successful `State.Running` handshake — falling back to its own engine automatically if
this server isn't installed, fails to start, or later stops. The two share their host-independent core
logic (component docblock parsing, name resolution, scanning, completion-context detection) through
`cast-language-core` (`editor/language-core/`), so the shared feature set can't drift between them.

## Architecture

- `src/parser/castParser.ts`: Streaming scanner and AST parser for Cast markup, `@props`, directives, and echo holes.
- `src/index/projectIndex.ts`: In-memory workspace indexer scanning user and framework views/components with change listeners.
- `src/diagnostics/diagnostics.ts`: AST and compiler validator reporting diagnostics with code action quick fixes.
- `src/features/`: LSP feature handlers (completion, hover, definition, documentLinks, formatting).
- `src/php/`: Virtual PHP document generator and source map engine for upstream LSP bridging.
- `src/server.ts`: LSP connection bootstrap over stdio using `vscode-languageserver/node`.

## Build & Test

```bash
cd editor/server
npm install
npm run build
npm test
```

## Install (global)

From the project root, `php cast engine:editor-install lsp` (or `engine:editor-install all`, which also
installs the VS Code extension) runs the steps above and then `npm install -g` from this directory, so
`cast-language-server` is resolvable from any project afterwards. It also checks for Node.js/npm and
offers to download a pinned, checksum-verified PHPactor phar into `bin/phpactor.phar` if missing (PHP
intelligence is disabled, not required, when PHPactor isn't present — see `src/php/engine.ts`).
