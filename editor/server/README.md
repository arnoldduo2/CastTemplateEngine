# Cast Language Server (`cast-language-server`)

High-performance, out-of-process Language Server Protocol (LSP) server for Cast templates (`*.cast.php`).

## Overview

`cast-language-server` provides rich language intelligence for Cast templates:

- **Diagnostics**: Fast AST parsing with real-time detection of unclosed or mismatched tags, unbalanced control directives (`@if`, `@foreach`, `@switch`), and `@props` syntax errors.
- **Strict-Typed `@props`**: Type validation, required vs optional props checking, and component inheritance resolution (`@props extends::...`).
- **Autocompletion**:
  - Directives (`@if`, `@foreach`, `@props`, etc.)
  - Component tags with auto-filled required prop snippets
  - Slots (`<Slot name="...">`)
  - Attribute names with type-aware defaults
  - `extends::` inheritance component paths
- **Hover**: Rich Markdown hover cards for components, prop types/defaults, slot declarations, and directives.
- **Go to Definition**: F12 / Ctrl+click navigation to component files, slot definitions, and inheritance targets.
- **Formatting**: Full-document indentation and on-type line formatting.
- **Embedded PHP Bridge**: Bidirectional character-accurate source maps (`SourceMap`, `VirtualPhpBuilder`) to bridge echo holes `@{ ... }` and directives to Phpactor or other PHP language servers.

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
