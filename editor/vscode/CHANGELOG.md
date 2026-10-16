# Changelog

## 2.0.0

- **Dedicated Language Server Integration**:
  - Integrated with `cast-language-server` TypeScript LSP server in `editor/server/`.
  - Comprehensive AST parsing with sub-millisecond diagnostics for unclosed tags, directive mismatches, and syntax errors.
  - Real-time `@props { ... }` validation and `extends::` inheritance resolution.
  - Contextual autocompletion with required props auto-expansion, slot completions, and typed attribute completions.
  - Go to Definition for components, slots, and `extends::` inheritance targets.
  - Hover documentation for components, prop types/defaults, slot tags, and directives.
  - Added `aprops` and `apropsext` snippets.
- **Tree-sitter Grammar Integration**:
  - Standalone `tree-sitter-cast` grammar supporting modern syntax trees and queries.

## 1.7.0

- **Embedded Language Intelligence Bridge**:
  - Virtual document bridge (`cast-embedded:`) forwarding `@css(...)`, `@script(...)`, `@js(...)`, and `@{ ... }` echo holes to VS Code's native PHP, JS, and CSS language providers.
  - Parameter-name inlay hints (`EmbeddedInlayHints`) for functional directives (`@route(...)`, `@htchars(...)`, etc.), matching native PHP function calls.
  - Native hover documentation (`FunctionDirectiveHovers` & `EmbeddedHovers`) bridging directly to real PHP docblocks and function signatures.
  - Go to Definition (`EmbeddedDefinitions`): Ctrl+click / F12 resolves variables and symbols inside `@{ }` echo holes, including loop/callback variables in `@map`/`@filter`/`@foreach`.
  - Completions (`EmbeddedCompletions`) for CSS properties, JS APIs, and PHP expressions inside directive bodies and echo holes.
- **Syntax Highlighting & Styling**:
  - Dedicated TextMate scope `keyword.control.directive.styled.cast` with configuration defaults for styled directives and bracket punctuation coloring.
  - Added `arender` snippet alias for `@render(...)`.
- **Indentation Improvements**:
  - Corrected doc comment (`/** ... */`) continuation line re-indentation within `@script(...)` and `@css(...)` blocks.

## 1.6.0

- **Hover for functional directives**: `@map(...)`, `@filter(...)`, the inline-render transform (`return(...)`/`@cast(...)`), the `@{ ... }` echo hole, and every `.filter`/`.map` segment of a fluent collection chain (`@$items.filter(...).map(...)`) now show hover documentation with accepted parameters and a short example.
- **Directive bracket highlighting**: a directive's parentheses now carry the same scope as its keyword, so themes color/bold them together (`@if(`...`)`, `@foreach(`...`)`, `@map(`...`)`, `@css(`...`)`, `@script(`...`)`, etc.), matching Laravel Blade's look.

## 1.5.1

- **Native CSS inside `@css(...)`**: Full syntax highlighting for CSS selectors, properties, values, units, and colors, with support for nested parentheses (`calc()`, `rgba()`) and `@{ ... }` dynamic PHP variables.
- **Native JavaScript inside `@script(...)` and `@js(...)`**: Full syntax highlighting for JS functions, variables, and event listeners.
- **HTML inside Expression Callbacks**: Template markup (`<tag ...>`, `</tag>`) inside `@map(...)` and other expressions is now highlighted as native HTML elements instead of PHP comparison operators.
- **Snippets in HTML context**: Cast snippets now trigger in both HTML and PHP contexts across `.cast.php` views.

## 0.3.0

- **Highlighting for the engine's `@` syntax**: `@{ $x }` (also inside attribute values and component string props), `@foreach ($users as $user):`, `@forelse` / `@empty` / `@endforelse`, `@if` / `@elseif` / `@else` / `@endif`, `@for`, `@while`, `@unless`, `@isset`, `@switch` / `@case` / `@default`, `@break`, `@continue`, `@php` ... `@endphp`, `@@`. The PHP in the parentheses is coloured as PHP; e-mail addresses, CSS `@media` and `<?php ?>` blocks are not touched.
- **Indentation that knows the whole view**: HTML tags, component tags (including attributes over several lines), PHP's alternative syntax (`<?php if (...): ?>` ... `<?php endif ?>`, `else`, `elseif`, `foreach`, `switch`), multi-line `<?php ... ?>` blocks with braces and parentheses, and the `@` directives, all at once.
  - **Format Document / Format Selection** and the command **Cast: Fix indentation** re-indent a view. Only leading whitespace changes; `<script>`, `<style>`, `<pre>`, `<textarea>`, comments and heredocs are left alone; `<html>` does not indent its children; a footer partial that closes tags the header opened is indented as if inside them.
  - **While typing** (setting `cast.autoIndent`, on by default, independent of `editor.formatOnType`): Enter indents the new line and corrects the line you just finished; a line that becomes `</div>`, `<?php endif ?>`, `@endif` or `@else` moves back as you type it.
- Snippets `aforeach`, `aforelse`, `aif`, `aifelse`, `afor`, `awhile`, `aswitch`, `aecho`.

## 0.2.0

- Reads the docblock and `??=` defaults of a component: hover table, completion of props (required first), values, `<Slot name>` names and component tags, diagnostics (setting `cast.diagnostics`, default hint), quick fixes, go to the `@var` line of a prop.
- Settings `cast.diagnostics`, `cast.propCase`.

## 0.1.0

- Highlighting for component tags, slots, props and `{ }` expressions in `.cast.php` (an injection grammar over VS Code's PHP/HTML).
- Ctrl+click, F12 and hover for components, views, legacy components and modules.
- Snippets.
