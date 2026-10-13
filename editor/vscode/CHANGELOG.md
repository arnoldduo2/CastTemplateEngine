# Changelog

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
