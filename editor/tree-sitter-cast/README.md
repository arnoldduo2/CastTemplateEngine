# tree-sitter-cast

Standalone [Tree-sitter](https://tree-sitter.github.io/) grammar and queries for Cast templates (`*.cast.php`).

## Overview

Provides concrete syntax trees for:
- Component tags (`<Card ...>`, `<Btns.Button />`, `</Card>`)
- Named slots (`<Slot name="left">`, `</Slot>`)
- Expressions in props (`total={$p['qty'] + 1}`, `{...$data}`)
- Strictly-typed `@props { ... }` and `@props extends::...` directives
- Echo holes `@{ ... }`
- Control directives (`@if`, `@else`, `@elseif`, `@endif`, `@foreach`, `@forelse`, `@empty`, `@endforelse`, `@for`, `@while`, `@switch`, `@case`, `@default`, `@break`, `@continue`, `@php`, `@endphp`)
- Functional and fluent directives (`@map`, `@filter`, `@$items.filter(...).map(...)`, `@render`, `@cast`)
- Scoped CSS (`@css(...)`) and Client JS (`@script(...)`, `@js(...)`)

## Queries

Located in `queries/`:
- `highlights.scm`: Syntax highlighting tokens mapped to standard capture names.
- `injections.scm`: Language injections for embedded PHP, CSS, and JavaScript.
- `folds.scm`: Code folding ranges for components, slots, directives, and style/script blocks.
- `indents.scm`: Indentation rules for editors supporting Tree-sitter indents.

## Editor Integration

Compatible with:
- **VS Code / Antigravity IDE** (via Tree-sitter extension or LSP)
- **Neovim** (via `nvim-treesitter`)
- **Zed**
- **Helix**

## Build & Test

```bash
cd editor/tree-sitter-cast
npm install
npm test
```
