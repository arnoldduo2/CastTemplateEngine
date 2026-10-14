# Changelog

All notable changes are listed here. This project follows [Semantic Versioning](https://semver.org).

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
